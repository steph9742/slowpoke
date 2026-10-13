import { Elysia, t } from "elysia";
import { betterAuth } from "../middleware/auth";
import { lireEtat } from "@slowpoke/connecteurs/synchro";
import { db } from "@slowpoke/database";
import { exclusionsSchema, harfanglabSchema } from "@slowpoke/database/tables";
import { eq, and, lte, asc, sql, count } from "drizzle-orm";
import { createLog } from "../utils/log";
import { composeScope, detectBroadScope, SCOPE_FIELDS } from "@slowpoke/database/exclusion-scope";

// LISTES BLANCHES — inventaire des angles morts volontaires.
//
// Poser une exclusion, c'est décider de ne plus voir quelque chose : sans inventaire ni date
// de revue, la décision devient permanente par oubli. D'où deux règles dans le schéma — motif
// obligatoire, date de revue obligatoire.
//
// LE REGISTRE A DEUX MOITIÉS :
//   1. `exclusion` — née d'un incident, qui la motive (`incident_id` NOT NULL) ;
//   2. `revue_regle` — une règle de l'outil posée HORS incident, qui doit sa revue aussi.
//
// Les deux portent une échéance, rappelée ensemble par `revueListesBlanches`. Quand une règle
// reçoit une exclusion, la revue isolée passe en « remplacée » : une seule échéance fait foi.


export const exclusionsRouter = new Elysia({ name: 'exclusions', prefix: '/api/exclusions', tags: ['Exclusions'] })
  .use(betterAuth)

  // Liste, filtrable par état. Triée par date de revue : ce qui expire en premier remonte
  // en tête, c'est l'ordre dans lequel on veut traiter.
  .get('/', async ({ query }) => {
    const conditions = []
    if (query.state) conditions.push(eq(exclusionsSchema.exclusion.state, query.state))
    if (query.incidentId) conditions.push(eq(exclusionsSchema.exclusion.incidentId, query.incidentId))
    // `overdue` : revue dépassée. C'est ce qui alimente l'alerte du rapport hebdomadaire.
    if (query.overdue === true) {
      conditions.push(eq(exclusionsSchema.exclusion.state, 'active'))
      conditions.push(lte(exclusionsSchema.exclusion.reviewDate, new Date()))
    }

    return await db.select().from(exclusionsSchema.exclusion)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(asc(exclusionsSchema.exclusion.reviewDate))
  }, {
    auth: ['lecteur', 'gestionnaire', 'admin', 'svc'],
    query: t.Object({
      state: t.Optional(t.Union([t.Literal('active'), t.Literal('revoquee')])),
      incidentId: t.Optional(t.String()),
      overdue: t.Optional(t.Boolean({ description: 'Ne retenir que les exclusions actives dont la date de revue est dépassée' })),
    }),
    detail: {
      summary: 'Lister les exclusions',
      description: "Triées par date de revue croissante : ce qui expire en premier apparaît en tête. `overdue=true` ne retient que les revues dépassées.",
    },
  })

  // LE REGISTRE, AVEC DE QUOI DISTINGUER LE VIDE DE LA PANNE.
  //
  // `GET /` rend un tableau nu, où zéro exclusion et un dispositif défaillant se lisent pareil.
  // Cette route rend le décompte ET le témoin du connecteur EDR.
  //
  // Ce registre n'est alimenté par AUCUN connecteur — une exclusion se consigne à la main —
  // donc un registre vide est un fait établi. Ce que le connecteur conditionne, c'est l'autre
  // question : existe-t-il des règles dans l'EDR qui auraient dû être consignées ?
  .get('/registre', async () => {
    const [compte] = await db.select({ n: sql<number>`count(*)::int` }).from(exclusionsSchema.exclusion)
    const [actives] = await db.select({ n: sql<number>`count(*)::int` })
      .from(exclusionsSchema.exclusion)
      .where(eq(exclusionsSchema.exclusion.state, 'active'))

    const etat = await lireEtat('harfanglab')
    const resultats = await db.select().from(exclusionsSchema.exclusion)
      .orderBy(asc(exclusionsSchema.exclusion.reviewDate))

    // La seconde moitié du registre : les règles posées hors incident, avec leur échéance.
    const revues = await db.select().from(exclusionsSchema.revueRegle)
      .where(eq(exclusionsSchema.revueRegle.etat, 'active'))
      .orderBy(asc(exclusionsSchema.revueRegle.echeance))

    return {
      total: compte?.n ?? 0,
      actives: actives?.n ?? 0,
      revuesSansIncident: revues.length,
      revues,
      alimentation: 'saisie humaine — aucun connecteur n\'écrit dans ce registre : une exclusion se consigne depuis un incident, une règle posée hors incident se consigne comme revue programmée',
      // Le témoin porte sur le RELEVÉ DE L'EDR, pas sur le registre : il dit si la question
      // « manque-t-il des exclusions » est seulement calculable.
      releveEdr: etat,
      resultats,
    }
  }, {
    auth: ['lecteur', 'gestionnaire', 'admin', 'svc'],
    detail: {
      summary: 'Registre des listes blanches, avec le témoin du relevé EDR',
      description: "Rend `{ total, actives, revuesSansIncident, revues, alimentation, releveEdr, resultats }` : les exclusions nées d'un incident ET les revues des règles posées hors incident — les deux moitiés du registre. Un registre vide est un FAIT — rien n'y écrit automatiquement — et non une donnée manquante. `releveEdr` à `null` ou en échec signifie en revanche qu'on ne peut pas savoir s'il existe des règles dans l'EDR qui auraient dû y figurer.",
    },
  })

  // Le formulaire lit ces champs plutôt que de les redéclarer : une seule source.
  .get('/champs-portee', () => SCOPE_FIELDS, {
    auth: ['lecteur', 'gestionnaire', 'admin'],
    detail: { summary: 'Critères de portée disponibles par outil' },
  })

  .post('/', async ({ body, user, status }) => {
    // Le motif et la date de revue sont contraints en base (NOT NULL + non vide), mais on
    // refuse ici avec un message utile plutôt que de laisser remonter une erreur SQL.
    if (!body.reason?.trim()) return status(422, { message: 'Le motif est obligatoire : une exclusion sans justification est indéfendable à la revue.' })

    // La portée vient soit des critères structurés (formulaire), soit d'un texte libre
    // (appel direct à l'API). Les critères priment : ils sont recherchables, le texte non.
    const details = Object.fromEntries(
      Object.entries(body.scopeDetails ?? {}).filter(([, v]) => typeof v === 'string' && v.trim().length > 0),
    ) as Record<string, string>
    const scope = Object.keys(details).length ? composeScope(details, body.tool) : (body.scope ?? '').trim()

    if (!scope) {
      return status(422, { message: 'La portée est obligatoire : renseignez au moins un critère (chemin, empreinte, règle, machine…).' })
    }

    // Portée manifestement large : on n'interdit pas, on exige une confirmation. Sans elle,
    // une exclusion sur « C:\ » passerait aussi discrètement qu'une exclusion précise.
    const alertes = detectBroadScope(details, body.tool)
    if (alertes.length && !body.acknowledgeBroadScope) {
      return status(409, {
        message: 'Portée très large : confirmez explicitement pour continuer.',
        broadScope: alertes,
      })
    }

    const reviewDate = new Date(body.reviewDate)
    if (Number.isNaN(reviewDate.getTime())) return status(422, { message: 'Date de revue invalide.' })

    // Règle de l'outil désignée dès la création : c'est le cas du bouton « consigner cette
    // règle », qui part du relevé de l'EDR. On refuse ici plutôt que de laisser remonter la
    // violation de l'index d'unicité, illisible pour qui la reçoit.
    const outilRef = body.outilRef?.trim() || null
    if (outilRef) {
      const [deja] = await db.select({ id: exclusionsSchema.exclusion.id, incidentId: exclusionsSchema.exclusion.incidentId })
        .from(exclusionsSchema.exclusion)
        .where(and(eq(exclusionsSchema.exclusion.outilRef, outilRef), eq(exclusionsSchema.exclusion.state, 'active')))
        .limit(1)
      if (deja) {
        return status(409, { message: `Cette règle est déjà consignée par une exclusion active (incident ${deja.incidentId}).` })
      }
    }

    const [cree] = await db.insert(exclusionsSchema.exclusion).values({
      incidentId: body.incidentId,
      tool: body.tool,
      toolOther: body.tool === 'autre' ? (body.toolOther?.trim() || null) : null,
      scopeDetails: details,
      scope,
      broadScopeAcknowledged: alertes.length > 0,
      reason: body.reason.trim(),
      reviewDate,
      outilRef,
      createdBy: user?.id,
    }).returning()

    // L'exclusion prend le relais d'une revue isolée sur la même règle, s'il y en avait une.
    if (outilRef && cree) {
      await db.update(exclusionsSchema.revueRegle)
        .set({ etat: 'remplacee', remplaceeLe: new Date(), remplaceeParExclusion: cree.id })
        .where(and(eq(exclusionsSchema.revueRegle.regleRef, outilRef), eq(exclusionsSchema.revueRegle.etat, 'active')))
    }

    const nomOutil = body.tool === 'autre' && body.toolOther?.trim() ? body.toolOther.trim() : body.tool
    await createLog(body.incidentId, 'update', user?.id, undefined,
      `Exclusion ajoutée sur ${nomOutil} — ${scope} (revue le ${reviewDate.toLocaleDateString('fr-FR')})`)

    return cree
  }, {
    auth: ['gestionnaire', 'admin'],
    body: t.Object({
      incidentId: t.String({ description: "Incident qui motive l'exclusion" }),
      tool: t.Union([t.Literal('harfanglab'), t.Literal('wazuh'), t.Literal('pare_feu'), t.Literal('autre')]),
      toolOther: t.Optional(t.String({ description: "Nom de l'outil quand `tool` vaut `autre`" })),
      scopeDetails: t.Optional(t.Record(t.String(), t.String(), { description: 'Critères de portée, combinables : chemin, empreinte, règle, machine… (voir GET /api/exclusions/champs-portee)' })),
      scope: t.Optional(t.String({ description: 'Portée en texte libre. Ignorée si `scopeDetails` est fourni.' })),
      reason: t.String({ description: "Pourquoi l'activité est légitime. Obligatoire." }),
      reviewDate: t.Union([t.String(), t.Date()], { description: 'Date de revue. Obligatoire : pas de liste blanche sans échéance.' }),
      outilRef: t.Optional(t.String({ description: "Référence de la règle correspondante dans l'outil, quand elle est connue dès la création — « consigner cette règle » depuis le relevé de l'EDR. Refusé en 409 si une exclusion active la cite déjà." })),
      acknowledgeBroadScope: t.Optional(t.Boolean({ description: 'Confirme une portée très large, sans quoi la création est refusée (409).' })),
    }),
    detail: {
      summary: 'Créer une exclusion',
      description: "La portée se renseigne par critères combinables (`scopeDetails`) — chemin, empreinte, règle, machine… — dont l'API compose le libellé. Une portée manifestement large (racine, joker seul, plage plus large qu'un /16) est refusée en 409 tant qu'elle n'est pas explicitement confirmée. `outilRef` désigne la règle de l'outil dès la création, ce qui évite un appariement en deux temps : refusé en 409 si une exclusion active la cite déjà, et une revue de règle active sur la même référence passe alors en « remplacée ».",
    },
  })

  // Révocation plutôt que suppression : l'historique des angles morts a une valeur, y
  // compris quand ils sont levés. Savoir qu'une exclusion a existé éclaire un incident
  // ultérieur sur le même périmètre.
  .patch('/:id/revoke', async ({ params, user, status }) => {
    const [existante] = await db.select().from(exclusionsSchema.exclusion)
      .where(eq(exclusionsSchema.exclusion.id, params.id)).limit(1)
    if (!existante) return status(404, { message: 'Exclusion introuvable' })
    if (existante.state === 'revoquee') return status(409, { message: 'Exclusion déjà révoquée.' })

    const [maj] = await db.update(exclusionsSchema.exclusion)
      .set({ state: 'revoquee', revokedAt: new Date(), revokedBy: user?.id })
      .where(eq(exclusionsSchema.exclusion.id, params.id))
      .returning()

    await createLog(existante.incidentId, 'update', user?.id, undefined,
      `Exclusion révoquée sur ${existante.tool} — ${existante.scope}`)

    return maj
  }, {
    auth: ['gestionnaire', 'admin'],
    params: t.Object({ id: t.String() }),
    detail: {
      summary: 'Révoquer une exclusion',
      description: "L'exclusion passe à l'état « révoquée » et reste consultable : l'historique des angles morts levés éclaire les incidents ultérieurs sur le même périmètre.",
    },
  })

  // Prolonger une revue : le cas courant après examen (« toujours légitime, on revoit
  // dans six mois »). Passe par une route dédiée pour être journalisé comme une décision.
  .patch('/:id/review', async ({ params, body, user, status }) => {
    const [existante] = await db.select().from(exclusionsSchema.exclusion)
      .where(eq(exclusionsSchema.exclusion.id, params.id)).limit(1)
    if (!existante) return status(404, { message: 'Exclusion introuvable' })

    const reviewDate = new Date(body.reviewDate)
    if (Number.isNaN(reviewDate.getTime())) return status(422, { message: 'Date de revue invalide.' })

    const [maj] = await db.update(exclusionsSchema.exclusion)
      .set({ reviewDate })
      .where(eq(exclusionsSchema.exclusion.id, params.id))
      .returning()

    await createLog(existante.incidentId, 'update', user?.id, undefined,
      `Exclusion revue sur ${existante.tool} — prochaine revue le ${reviewDate.toLocaleDateString('fr-FR')}`)

    return maj
  }, {
    auth: ['gestionnaire', 'admin'],
    params: t.Object({ id: t.String() }),
    body: t.Object({ reviewDate: t.Union([t.String(), t.Date()]) }),
    detail: { summary: 'Reporter la date de revue après examen' },
  })

  // --- REVUES DE RÈGLES SANS INCIDENT ---
  //
  // Sous `/api/exclusions/revues` : même registre, deux moitiés. Aucune route `/:id` nue ici,
  // sans quoi `revues` serait pris pour un identifiant d'exclusion.
  .get('/revues', async ({ query }) => {
    const R = exclusionsSchema.revueRegle
    const conditions = [query.etat ? eq(R.etat, query.etat) : undefined].filter(Boolean)
    return await db.select().from(R)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(asc(R.echeance))
  }, {
    auth: ['lecteur', 'gestionnaire', 'admin', 'svc'],
    query: t.Object({
      etat: t.Optional(t.Union([t.Literal('active'), t.Literal('remplacee'), t.Literal('levee')])),
    }),
    detail: {
      summary: 'Lister les revues de règles posées hors incident',
      description: "Triées par échéance croissante. `remplacee` signifie qu'une exclusion née d'un incident a pris le relais sur la même règle : c'est son échéance qui fait alors autorité.",
    },
  })

  .post('/revues', async ({ body, user, status }) => {
    const R = exclusionsSchema.revueRegle
    const regleRef = body.regleRef.trim()
    const motif = body.motif.trim()
    if (!regleRef) return status(422, { message: 'La référence de la règle est obligatoire.' })
    if (!motif) return status(422, { message: "Le motif est obligatoire : une règle sans incident ni motif n'est pas défendable à la revue." })

    const echeance = new Date(body.echeance)
    if (Number.isNaN(echeance.getTime())) return status(422, { message: 'Échéance invalide.' })

    const tool = body.tool ?? 'harfanglab'

    // Une règle déjà couverte par une exclusion n'a pas besoin d'une seconde échéance :
    // c'est l'incident qui la motive, et c'est son exclusion qui porte la revue.
    const [exclusionActive] = await db.select({ incidentId: exclusionsSchema.exclusion.incidentId })
      .from(exclusionsSchema.exclusion)
      .where(and(eq(exclusionsSchema.exclusion.outilRef, regleRef), eq(exclusionsSchema.exclusion.state, 'active')))
      .limit(1)
    if (exclusionActive) {
      return status(409, { message: `Cette règle est déjà consignée par une exclusion active (incident ${exclusionActive.incidentId}) : c'est son échéance qui fait autorité.` })
    }

    const [dejaRevue] = await db.select({ id: R.id }).from(R)
      .where(and(eq(R.tool, tool), eq(R.regleRef, regleRef), eq(R.etat, 'active'))).limit(1)
    if (dejaRevue) return status(409, { message: 'Cette règle porte déjà une revue programmée.' })

    // Référence inconnue du relevé : presque toujours une faute de frappe. On refuse quand
    // un relevé existe — s'il n'y en a aucun, on ne peut rien affirmer et on laisse passer.
    let libelle = body.libelle?.trim() || null
    if (tool === 'harfanglab') {
      const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(harfanglabSchema.harfanglabRule)
      if (n > 0) {
        const [regle] = await db.select().from(harfanglabSchema.harfanglabRule)
          .where(eq(harfanglabSchema.harfanglabRule.ref, regleRef)).limit(1)
        if (!regle) return status(422, { message: `Aucune règle « ${regleRef} » dans le dernier relevé de l'EDR.` })
        libelle = libelle ?? regle.libelle ?? null
      }
    }

    const [cree] = await db.insert(R).values({ tool, regleRef, libelle, motif, echeance, creePar: user?.id }).returning()
    return cree
  }, {
    auth: ['gestionnaire', 'admin'],
    body: t.Object({
      regleRef: t.String({ description: "Référence de la règle dans l'outil." }),
      libelle: t.Optional(t.String({ description: 'Libellé lisible. Repris du relevé de l\'EDR s\'il est absent.' })),
      motif: t.String({ description: 'Pourquoi cette règle existe sans incident. Obligatoire.' }),
      echeance: t.Union([t.String(), t.Date()], { description: 'Date de revue. Obligatoire, comme pour une exclusion.' }),
      tool: t.Optional(t.Union([t.Literal('harfanglab'), t.Literal('wazuh'), t.Literal('pare_feu'), t.Literal('autre')])),
    }),
    detail: {
      summary: 'Programmer la revue d\'une règle posée hors incident',
      description: "Pour les règles de l'outil qui ne naissent pas d'un incident. Refusé en 409 si une exclusion active cite déjà la règle, ou si elle porte déjà une revue. La date est rappelée par la tâche de revue comme celle d'une exclusion.",
    },
  })

  .patch('/revues/:id', async ({ params, body, status }) => {
    const R = exclusionsSchema.revueRegle
    const [existante] = await db.select().from(R).where(eq(R.id, params.id)).limit(1)
    if (!existante) return status(404, { message: 'Revue introuvable' })
    if (existante.etat !== 'active') return status(409, { message: 'Cette revue n\'est plus active.' })

    const echeance = new Date(body.echeance)
    if (Number.isNaN(echeance.getTime())) return status(422, { message: 'Échéance invalide.' })

    // La mémoire du rappel est remise à zéro : une échéance repoussée doit pouvoir sonner
    // à nouveau, sans quoi le report vaudrait extinction définitive.
    const [maj] = await db.update(R)
      .set({ echeance, derniereAlerteLe: null, derniereAlerteNiveau: null })
      .where(eq(R.id, params.id)).returning()
    return maj
  }, {
    auth: ['gestionnaire', 'admin'],
    params: t.Object({ id: t.String() }),
    body: t.Object({ echeance: t.Union([t.String(), t.Date()]) }),
    detail: { summary: 'Reporter la revue d\'une règle après examen' },
  })

  .patch('/revues/:id/lever', async ({ params, body, user, status }) => {
    const R = exclusionsSchema.revueRegle
    const [existante] = await db.select().from(R).where(eq(R.id, params.id)).limit(1)
    if (!existante) return status(404, { message: 'Revue introuvable' })
    if (existante.etat === 'levee') return status(409, { message: 'Cette revue est déjà levée.' })

    const motif = body.motif?.trim()
    if (!motif) return status(422, { message: 'Dites pourquoi la revue est levée : règle retirée de l\'outil, ou besoin disparu.' })

    const [maj] = await db.update(R)
      .set({ etat: 'levee', leveeLe: new Date(), leveePar: user?.id, motifLevee: motif })
      .where(eq(R.id, params.id)).returning()
    return maj
  }, {
    auth: ['gestionnaire', 'admin'],
    params: t.Object({ id: t.String() }),
    body: t.Object({ motif: t.String({ description: 'Pourquoi la revue est levée. Obligatoire.' }) }),
    detail: {
      summary: 'Lever la revue d\'une règle',
      description: "Pour une règle retirée de l'outil ou un besoin disparu. La ligne reste consultable : savoir qu'un angle mort a existé éclaire un incident ultérieur.",
    },
  })
