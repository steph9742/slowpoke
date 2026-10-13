import { Elysia, t } from "elysia";
import { query_builder } from "@slowpoke/database";
import { sql } from "drizzle-orm"
import { betterAuth } from "../middleware/auth";

// GARDE-FOUS D'EXÉCUTION.
//
// Le rôle PostgreSQL `query_builder` n'a que le droit SELECT, mais une jointure malheureuse
// peut ramener des millions de lignes ou tourner indéfiniment sur la base de production.
// Deux limites, réglables sans toucher au code :
//   QUERY_BUILDER_TIMEOUT_MS : durée maximale (statement_timeout PostgreSQL)
//   QUERY_BUILDER_MAX_ROWS   : nombre maximal de lignes rapportées
const TIMEOUT_MS = Number(process.env.QUERY_BUILDER_TIMEOUT_MS) || 10_000
const MAX_ROWS = Number(process.env.QUERY_BUILDER_MAX_ROWS) || 5_000

export const queryBuilderRouter = new Elysia({ name: 'query-builder', prefix: '/api/query' })
  .use(betterAuth)
  .post('/', async ({ body, status }) => {
    const forbiddenPatterns = [
      /--/, // commentaires SQL
      /\/\*/, // commentaires SQL
      /\*\//, // commentaires SQL
      /DROP\s+TABLE/i, // commandes DDL
      /ALTER\s+TABLE/i,
      /INSERT\s+INTO/i,
      /UPDATE\s+\w+/i,
      /DELETE\s+FROM/i,
      /CREATE\s+TABLE/i,
      /TRUNCATE\s+TABLE/i,
      /WITH\s+.*AS/i, // CTE
    ];


    for (const pattern of forbiddenPatterns) {
      if (pattern.test(body.query)) {
        return status(403, 'Requête interdite détectée');
      }
    }

    // La requête est encapsulée : `statement_timeout` s'applique à la transaction, et la
    // sous-requête plafonne les lignes SANS altérer la requête écrite par l'utilisateur
    // (pas de LIMIT collé à la main, qui casserait un ORDER BY ou un GROUP BY existant).
    try {
      const { rows, rowCount } = await query_builder.transaction(async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL statement_timeout = ${TIMEOUT_MS}`))
        return await tx.execute(
          sql.raw(`SELECT * FROM (${body.query.replace(/;\s*$/, '')}) AS resultat_limite LIMIT ${MAX_ROWS + 1}`),
        )
      })

      // On demande une ligne de plus que la limite : si elle arrive, c'est que le résultat
      // était tronqué. Le dire explicitement — un tableau silencieusement coupé se lit
      // comme un résultat complet, et fausse toute conclusion qu'on en tire.
      const tronque = rows.length > MAX_ROWS
      return {
        rows: tronque ? rows.slice(0, MAX_ROWS) : rows,
        count: tronque ? MAX_ROWS : rowCount,
        truncated: tronque,
        ...(tronque ? { message: `Résultat tronqué à ${MAX_ROWS} lignes (limite QUERY_BUILDER_MAX_ROWS). Affinez la requête pour voir l'ensemble.` } : {}),
      }
    }
    catch (erreur) {
      const motif = erreur instanceof Error ? erreur.message : String(erreur)
      // Drizzle enveloppe l'erreur PostgreSQL dans « Failed query: … » : le motif réel est
      // dans la cause, et le code SQLSTATE y est porté à part. On regarde les trois.
      const cause = (erreur as { cause?: { message?: string, code?: string } })?.cause
      const codeSql = cause?.code ?? (erreur as { code?: string })?.code
      const texte = `${motif} ${cause?.message ?? ''}`
      // 57014 = query_canceled : c'est le délai qui a expiré, pas une erreur de syntaxe.
      if (codeSql === '57014' || /statement timeout|canceling statement/i.test(texte)) {
        return status(408, `Requête interrompue après ${TIMEOUT_MS} ms (limite QUERY_BUILDER_TIMEOUT_MS). Restreignez la période ou ajoutez des filtres.`)
      }
      return status(400, `Erreur SQL : ${cause?.message ?? motif}`)
    }
  }, {
    body: t.Object({
      query: t.String({ description: 'Requête SQL à exécuter' }),
    }),
    auth: ['admin'],
    detail: {
      summary: 'Exécuter une requête SQL arbitraire',
      description: `Exécute une requête SQL en lecture seule. Des filtres empêchent les requêtes dangereuses. Deux garde-fous : ${MAX_ROWS} lignes au maximum (réponse marquée « truncated ») et ${TIMEOUT_MS} ms d'exécution (408 au-delà).`
    },
    response: {
      200: t.Object({
        rows: t.Array(t.Record(t.String(), t.Unknown())),
        count: t.Union([t.Number({ description: 'Nombre de lignes retournées' }), t.Null({ description: 'Nombre de lignes non disponible' })]),
        truncated: t.Optional(t.Boolean({ description: 'Vrai si le résultat a été tronqué à la limite de lignes' })),
        message: t.Optional(t.String({ description: 'Précision affichée quand le résultat est tronqué' })),
      }, { description: 'Résultat de la requête SQL' }),
      400: t.String({ description: 'Erreur SQL' }),
      403: t.String({ description: 'Requête interdite détectée' }),
      408: t.String({ description: 'Délai maximal d\'exécution dépassé' }),
    }
  })
