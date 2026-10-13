import { Elysia, t } from "elysia"
import { db } from "@slowpoke/database"
import { betterAuth } from "../middleware/auth"
import { count } from "drizzle-orm"
import { mainSchema, glpiSchema } from "@slowpoke/database/tables"
import { COMPOSANTES, composanteDeLEntite, entiteEstLaboratoire } from "@slowpoke/database/composantes"
import { and, isNotNull, isNull, sql, eq, gte, lt, inArray, notInArray } from "drizzle-orm"

// BORNE DE FIN INCLUSIVE : le sélecteur envoie des jours, lus comme minuit, donc
// `between(createdAt, from, to)` s'arrêtait au début du dernier jour et « jusqu'à aujourd'hui »
// excluait la journée. La fin de période est le lendemain à minuit, exclu.
function periode(from: Date, to: Date) {
  const fin = new Date(to)
  fin.setDate(fin.getDate() + 1)
  return and(nonArchive, gte(mainSchema.incident.createdAt, from), lt(mainSchema.incident.createdAt, fin))
}

// Un incident archivé n'entre dans aucune statistique : il garde son dossier, pas sa place
// dans les chiffres de la cellule.
const nonArchive = isNull(mainSchema.incident.archiveLe)

export const statsRouter = new Elysia({ name: "stats", prefix: "/api/stats", tags: ["Graphiques"], detail: { hide: true } })
  .use(betterAuth)
  // Compteurs de synthèse pour le tableau de bord (état courant + mois en cours / précédent)
  .get("/overview", async () => {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)

    // « En traitement » = investigation ou remédiation en cours (pas les 'open' non pris en charge, ni résolus/clôturés)
    const inTreatment = inArray(mainSchema.incident.status, ['investigating', 'in_progress'])
    // « Actif » = ni résolu ni clôturé (pour repérer les critiques à surveiller, y compris les nouveaux)
    const active = notInArray(mainSchema.incident.status, ['resolved', 'closed'])

    const [treatingRow] = await db.select({ c: count() })
      .from(mainSchema.incident)
      .where(and(nonArchive, inTreatment))

    // Total « ouverts » = tout ce qui n'est ni résolu ni clôturé (open + investigation + en cours)
    const [activeRow] = await db.select({ c: count() })
      .from(mainSchema.incident)
      .where(and(nonArchive, active))

    const [criticalRow] = await db.select({ c: count() })
      .from(mainSchema.incident)
      .where(and(nonArchive, eq(mainSchema.incident.severity, 'critical'), active))

    const [monthRow] = await db.select({ c: count() })
      .from(mainSchema.incident)
      .where(and(nonArchive, gte(mainSchema.incident.createdAt, startOfMonth)))

    const [lastMonthRow] = await db.select({ c: count() })
      .from(mainSchema.incident)
      .where(and(
        nonArchive,
        gte(mainSchema.incident.createdAt, startOfLastMonth),
        lt(mainSchema.incident.createdAt, startOfMonth),
      ))

    return {
      inTreatment: treatingRow?.c ?? 0,
      active: activeRow?.c ?? 0,
      critical: criticalRow?.c ?? 0,
      month: monthRow?.c ?? 0,
      lastMonth: lastMonthRow?.c ?? 0,
    }
  }, {
    auth: ['lecteur', 'gestionnaire', 'admin'],
  })
  .get("/users", async ({ query }) => {
    return await db.select({
      affiliation: mainSchema.incidentUser.affiliation,
      count: count()
    })
      .from(mainSchema.incidentUser)
      .innerJoin(mainSchema.incident, eq(mainSchema.incidentUser.incidentId, mainSchema.incident.id))
      .groupBy(mainSchema.incidentUser.affiliation)
      .where(and(
        isNotNull(mainSchema.incidentUser.affiliation),
        periode(query.from, query.to),
      ))
  }, {
    auth: ['lecteur', 'gestionnaire', 'admin'],
    query: t.Object({
      from: t.Date(),
      to: t.Date(),
    })
  })
  // Jours au sens de l'établissement : `createdAt` est stocké en UTC, et un regroupement brut
  // rangeait sur la veille ce qui était signalé entre minuit et 2 h, heure de Paris.
  .get("/timeline", async ({ query }) => {
    return await db.select({
      date: sql<string>`DATE_TRUNC('day', ${mainSchema.incident.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Paris')::date`,
      total: count()
    })
      .from(mainSchema.incident)
      .groupBy(sql`DATE_TRUNC('day', ${mainSchema.incident.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Paris')::date`)
      .orderBy(sql`DATE_TRUNC('day', ${mainSchema.incident.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Paris')::date`)
      .where(periode(query.from, query.to))
  }, {
    auth: ['lecteur', 'gestionnaire', 'admin'],
    query: t.Object({
      from: t.Date(),
      to: t.Date(),
    })
  })
  .get("/types", async ({ query }) => {
    return await db.select({
      type: mainSchema.incident.type,
      count: count()
    })
      .from(mainSchema.incident)
      .groupBy(mainSchema.incident.type)
      .where(periode(query.from, query.to))
      .orderBy(sql`${count()} DESC`)
  }, {
    auth: ['lecteur', 'gestionnaire', 'admin'],
    query: t.Object({
      from: t.Date(),
      to: t.Date(),
    })
  })
  .get("/severity", async ({ query }) => {
    return await db.select({
      severity: mainSchema.incident.severity,
      count: count()
    })
      .from(mainSchema.incident)
      .groupBy(mainSchema.incident.severity)
      .where(periode(query.from, query.to))
  }, {
    auth: ['lecteur', 'gestionnaire', 'admin'],
    query: t.Object({
      from: t.Date(),
      to: t.Date(),
    })
  })
  // COMPOSANTES IMPACTÉES — un code, pas six écritures.
  //
  // Grouper sur la saisie brute mettait `cmpi-902` et `cmpa-902` sur deux lignes, chacune avec
  // la moitié du compte. Le regroupement porte sur le code normalisé, et les machines rejoignent
  // les personnes : une composante est impactée qu'un agent ou qu'une machine le soit.
  .get("/composantes", async ({ query }) => {
    const bornes = query.from && query.to
      ? periode(query.from, query.to)
      : nonArchive

    const parPersonne = await db.select({
      code: mainSchema.incidentUser.composanteCode,
      incidentId: mainSchema.incidentUser.incidentId,
    })
      .from(mainSchema.incidentUser)
      .innerJoin(mainSchema.incident, eq(mainSchema.incidentUser.incidentId, mainSchema.incident.id))
      .where(bornes)

    const parMachine = await db.select({
      entite: glpiSchema.glpiMachine.entiteComplet,
      incidentId: glpiSchema.incidentMachine.incidentId,
    })
      .from(glpiSchema.incidentMachine)
      .leftJoin(glpiSchema.glpiMachine, eq(glpiSchema.glpiMachine.glpiId, glpiSchema.incidentMachine.glpiId))
      .innerJoin(mainSchema.incident, eq(mainSchema.incident.id, glpiSchema.incidentMachine.incidentId))
      .where(bornes)

    // Incidents DISTINCTS par composante : deux agents d'une même composante sur un même
    // incident ne le comptent pas deux fois. Un incident touchant deux composantes compte
    // dans chacune — le total des lignes dépasse donc le nombre d'incidents.
    const paires = new Map<string, Set<string>>()
    const ajouter = (code: string | null, incidentId: string) => {
      if (!code) return
      const s = paires.get(code) ?? new Set<string>()
      s.add(incidentId)
      paires.set(code, s)
    }
    for (const l of parPersonne) ajouter(l.code, l.incidentId)
    for (const l of parMachine) ajouter(composanteDeLEntite(l.entite), l.incidentId)

    // LABORATOIRES : comptés à part, jamais rangés sous une composante. Les confondre avec
    // l'absence de rattachement fait passer un parc entier pour une donnée manquante, alors que
    // le rattachement est connu — il n'est simplement pas une composante.
    const laboratoires = new Set<string>()
    for (const l of parMachine) if (entiteEstLaboratoire(l.entite)) laboratoires.add(l.incidentId)

    // Ni composante, ni laboratoire : ce qui reste vraiment sans rattachement connu.
    const sansComposante = new Set<string>()
    for (const l of parPersonne) if (!l.code) sansComposante.add(l.incidentId)
    for (const l of parMachine) {
      if (!composanteDeLEntite(l.entite) && !entiteEstLaboratoire(l.entite)) sansComposante.add(l.incidentId)
    }

    // Une entité d'inventaire NOUVELLE ou renommée n'est rattachée à rien, et GLPI ne
    // prévient pas : l'énumérer fait de l'angle mort une ligne à lire, au lieu d'une baisse
    // inexpliquée du compte d'une composante.
    const inconnues = new Map<string, number>()
    for (const l of parMachine) {
      if (l.entite && !composanteDeLEntite(l.entite) && !entiteEstLaboratoire(l.entite)) {
        inconnues.set(l.entite, (inconnues.get(l.entite) ?? 0) + 1)
      }
    }

    return {
      resultats: [...paires.entries()]
        .map(([code, ids]) => ({
          code,
          // Le libellé de référence, jamais celui qui a été saisi : les libellés stockés
          // sont périmés ou tronqués, et c'est le code qui fait foi.
          composante: COMPOSANTES[code] ?? code,
          count: ids.size,
        }))
        .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)),
      sansComposante: sansComposante.size,
      laboratoires: laboratoires.size,
      entitesNonResolues: [...inconnues.entries()]
        .map(([entite, machines]) => ({ entite, machines }))
        .sort((a, b) => b.machines - a.machines),
      codesInconnus: [...paires.keys()].filter(c => !COMPOSANTES[c]).sort(),
    }
  }, {
    auth: ['lecteur', 'gestionnaire', 'admin', 'svc'],
    query: t.Object({
      from: t.Optional(t.Date()),
      to: t.Optional(t.Date()),
    }),
    detail: {
      hide: false,
      summary: 'Incidents par composante',
      description: "Réunit les personnes (rattachées par code `cmpi-NNN`, six écritures ramenées à une) et les machines (rattachées par entité d'inventaire) sous le même code. Un incident compte une fois par composante concernée : le total des lignes peut dépasser le nombre d'incidents. `laboratoires` compte à part les incidents rattachés à une unité de recherche — une UMR n'a pas de tutelle d'UFR à lui inventer. `sansComposante` ne garde que ce dont le rattachement est réellement inconnu, et n'est jamais réparti. `entitesNonResolues` énumère les entités d'inventaire qu'aucune règle ne rattache, une entité nouvelle y apparaissant au lieu de disparaître.",
    },
  })
