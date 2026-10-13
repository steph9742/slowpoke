import { Elysia, t } from "elysia";
import { betterAuth } from "../middleware/auth";
import { db } from "@slowpoke/database";
import { sql } from "drizzle-orm";

// CORRÉLATION — ce qui revient plusieurs fois.
//
// Une IP, une empreinte ou un compte qui réapparaît d'un incident à l'autre raconte ce
// qu'aucun incident isolé ne dit. Ces valeurs vivent dans des colonnes TABLEAU réparties sur
// cinq tables : une route plutôt qu'une requête type du query builder, celui-ci étant réservé
// aux admins alors que la corrélation sert d'abord aux gestionnaires.

export const correlationRouter = new Elysia({ name: 'correlation', prefix: '/api/stats', tags: ['Statistiques'] })
  .use(betterAuth)
  .get('/correlation', async ({ query }) => {
    const jours = Math.min(Math.max(query.days ?? 30, 1), 365)
    const seuil = Math.max(query.min ?? 3, 2)

    // `unnest` déplie chaque colonne tableau en lignes, l'union rassemble les cinq
    // origines, puis on agrège. Écrit sans CTE à dessein : le query builder les refuse, et
    // cette requête doit rester copiable telle quelle par qui veut l'adapter.
    const resultat = await db.execute(sql`
      SELECT
        valeur,
        origine,
        COUNT(DISTINCT incident_id)::int AS occurrences,
        ARRAY_AGG(DISTINCT incident_id) AS incidents,
        MAX(created_at) AS dernier_incident
      FROM (
        SELECT i.id AS incident_id, i.created_at, 'machines' AS origine, UNNEST(m.machines) AS valeur
          FROM malware_incident m JOIN incident i ON i.id = m.incident_id
        UNION ALL
        SELECT i.id, i.created_at, 'iocs', UNNEST(m.iocs)
          FROM malware_incident m JOIN incident i ON i.id = m.incident_id
        UNION ALL
        SELECT i.id, i.created_at, 'c2', UNNEST(m.c2)
          FROM malware_incident m JOIN incident i ON i.id = m.incident_id
        UNION ALL
        SELECT i.id, i.created_at, 'machines', UNNEST(r.machines)
          FROM ransomware_incident r JOIN incident i ON i.id = r.incident_id
        UNION ALL
        SELECT i.id, i.created_at, 'iocs', UNNEST(r.iocs)
          FROM ransomware_incident r JOIN incident i ON i.id = r.incident_id
        UNION ALL
        SELECT i.id, i.created_at, 'machines', UNNEST(n.machines)
          FROM intrusion_incident n JOIN incident i ON i.id = n.incident_id
        UNION ALL
        SELECT i.id, i.created_at, 'sourceIps', UNNEST(n.source_ips)
          FROM intrusion_incident n JOIN incident i ON i.id = n.incident_id
        UNION ALL
        SELECT i.id, i.created_at, 'compromisedAccounts', UNNEST(n.compromised_accounts)
          FROM intrusion_incident n JOIN incident i ON i.id = n.incident_id
        UNION ALL
        SELECT i.id, i.created_at, 'sourceIps', UNNEST(d.source_ips)
          FROM ddos_incident d JOIN incident i ON i.id = d.incident_id
      ) AS valeurs
      WHERE created_at >= now() - (${jours} || ' days')::interval
        AND incident_id NOT IN (SELECT id FROM incident WHERE archive_le IS NOT NULL)
        AND valeur IS NOT NULL
        AND length(trim(valeur)) > 0
      GROUP BY valeur, origine
      HAVING COUNT(DISTINCT incident_id) >= ${seuil}
      ORDER BY occurrences DESC, dernier_incident DESC
      LIMIT 200
    `)

    return {
      days: jours,
      min: seuil,
      results: resultat.rows,
    }
  }, {
    auth: ['lecteur', 'gestionnaire', 'admin', 'svc'],
    query: t.Object({
      days: t.Optional(t.Number({ description: 'Fenêtre glissante en jours (défaut 30, max 365)' })),
      min: t.Optional(t.Number({ description: "Nombre minimal d'incidents distincts (défaut 3, minimum 2)" })),
    }),
    detail: {
      summary: 'Valeurs récurrentes entre incidents',
      description: "Machines, IOC, IP sources, serveurs C2 et comptes compromis apparaissant dans au moins N incidents distincts sur une fenêtre glissante. Le comptage porte sur les INCIDENTS distincts, pas sur les occurrences : une même IP citée trois fois dans un seul incident ne constitue pas une récurrence.",
    },
  })
