import { Elysia, t } from 'elysia'
import { betterAuth } from '../middleware/auth'
import { db } from '@slowpoke/database'
import { mainSchema, playbooksSchema, echeancesSchema, settingsSchema } from '@slowpoke/database/tables'
import { and, eq, count, gte, desc, inArray, sql } from 'drizzle-orm'
import { analyserCases, synchroniserPlaybooks, lireConfigGitLab } from '../utils/playbooks'
import { lireConfigIA } from '../utils/ia'
import { createLog } from '../utils/log'
import { procedurePour, echeancesPour, TOUTES_PROCEDURES, NIVEAU_P, courtVraiment, CLE_NIS2_DEPUIS, type DecisionEcheance } from '../utils/conduite'
import { LECTURES, FILTRES } from '../utils/lectures'

// CONDUITE À TENIR — la procédure, appliquée à un incident précis.
//
// Rien n'est engendré : c'est la checklist du dépôt de documentation telle qu'écrite, plus
// deux choses que le texte ne peut pas savoir — où en est CET incident, et depuis quand ses
// compteurs réglementaires courent.

const Case = t.Object({
  cle: t.String(),
  texte: t.String(),
  section: t.String(),
  fait: t.Boolean(),
  faitLe: t.Union([t.String(), t.Null()]),
})

const Echeance = t.Object({
  cle: t.String(),
  nom: t.String(),
  delaiHeures: t.Number(),
  depart: t.String(),
  condition: t.String(),
  porteur: t.String(),
  defaut: t.String(),
  applicable: t.Union([t.Boolean(), t.Null()]),
  decidePar: t.Union([t.String(), t.Null()]),
  decideLe: t.Union([t.String(), t.Null()]),
  court: t.Boolean(),
  echeance: t.Union([t.String(), t.Null()]),
  heuresRestantes: t.Union([t.Number(), t.Null()]),
  deposeLe: t.Union([t.String(), t.Null()]),
  reference: t.Union([t.String(), t.Null()]),
  deposePar: t.Union([t.String(), t.Null()]),
})

async function nis2ArmeDepuis(): Promise<Date | null> {
  const [ligne] = await db.select({ value: settingsSchema.appSetting.value })
    .from(settingsSchema.appSetting)
    .where(eq(settingsSchema.appSetting.key, CLE_NIS2_DEPUIS))
    .limit(1)
  if (!ligne?.value) return null
  const d = new Date(ligne.value)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Décisions d'applicabilité prises pour un incident, par clé de compteur. */
async function decisionsPour(incidentId: string): Promise<Record<string, DecisionEcheance>> {
  const lignes = await db.select().from(echeancesSchema.incidentEcheance)
    .where(eq(echeancesSchema.incidentEcheance.incidentId, incidentId))
  return Object.fromEntries(lignes.map(l => [l.cle, {
    applicable: l.applicable,
    decidePar: l.decidePar,
    decideLe: l.decideLe,
    deposeLe: l.deposeLe,
    reference: l.reference,
    deposePar: l.deposePar,
  }]))
}

const avecCourt = (e: ReturnType<typeof echeancesPour>[number]) => ({ ...e, court: courtVraiment(e) })

const Document = t.Union([t.Object({
  reference: t.String(),
  titre: t.String(),
  version: t.Union([t.String(), t.Null()]),
  statut: t.Union([t.String(), t.Null()]),
  corps: t.String(),
  dateRevision: t.Union([t.String(), t.Null()]),
}), t.Null()])

async function documentPar(reference: string) {
  const [d] = await db.select().from(playbooksSchema.playbook)
    .where(eq(playbooksSchema.playbook.reference, reference)).limit(1)
  if (!d) return null
  return {
    reference: d.reference,
    titre: d.titre,
    version: d.version,
    statut: d.statut,
    corps: d.corps,
    dateRevision: d.dateRevision ? d.dateRevision.toISOString() : null,
  }
}

export const conduiteRouter = new Elysia({ name: 'conduite', prefix: '/api', tags: ['Conduite à tenir'] })
  .use(betterAuth)
  .get('/incidents/:id/conduite', async ({ params, query, status }) => {
    const [incident] = await db.select().from(mainSchema.incident)
      .where(eq(mainSchema.incident.id, params.id)).limit(1)
    if (!incident) return status(404, { message: 'Incident introuvable.' })

    // Le nombre de comptes concernés distingue un cas isolé d'une campagne.
    const [{ n } = { n: 0 }] = await db.select({ n: count() })
      .from(mainSchema.incidentUser)
      .where(eq(mainSchema.incidentUser.incidentId, incident.id))

    const auto = procedurePour(incident, Number(n))
    // Une procédure imposée à la main prime : Slowpoke ne sait pas juger si un compte est
    // « critique » au sens de l'annexe E.
    const choisie = query.checklist
      ? TOUTES_PROCEDURES.find(p => p.checklist === query.checklist) ?? auto
      : auto

    const checklist = await documentPar(choisie.checklist)
    const fiche = await documentPar(choisie.fiche)

    const etats = checklist
      ? await db.select().from(playbooksSchema.incidentChecklistItem)
        .where(and(
          eq(playbooksSchema.incidentChecklistItem.incidentId, incident.id),
          eq(playbooksSchema.incidentChecklistItem.playbookReference, choisie.checklist),
        ))
      : []
    const parCle = new Map(etats.map(e => [e.cle, e]))

    const cases = checklist
      ? analyserCases(checklist.corps).map(c => ({
        ...c,
        fait: parCle.get(c.cle)?.fait ?? false,
        faitLe: parCle.get(c.cle)?.faitLe?.toISOString() ?? null,
      }))
      : []

    return {
      procedure: { ...choisie, impose: Boolean(query.checklist) },
      alternatives: TOUTES_PROCEDURES,
      niveau: NIVEAU_P[incident.severity as keyof typeof NIVEAU_P] ?? 'P?',
      fiche,
      checklist,
      cases,
      echeances: echeancesPour(incident, await decisionsPour(incident.id), await nis2ArmeDepuis()).map(avecCourt),
      // Sans configuration GitLab, la table est vide et l'interface doit le dire plutôt
      // que d'afficher une conduite à tenir vide comme si de rien n'était.
      sourceConfiguree: Boolean(await lireConfigGitLab()),
      assistanceConfiguree: Boolean(await lireConfigIA()),
    }
  }, {
    auth: ['lecteur', 'gestionnaire', 'admin', 'svc'],
    query: t.Object({ checklist: t.Optional(t.String()) }),
    response: {
      200: t.Object({
        procedure: t.Object({ fiche: t.String(), checklist: t.String(), motif: t.String(), impose: t.Boolean() }),
        alternatives: t.Array(t.Object({ fiche: t.String(), checklist: t.String(), motif: t.String() })),
        niveau: t.String(),
        fiche: Document,
        checklist: Document,
        cases: t.Array(Case),
        echeances: t.Array(Echeance),
        sourceConfiguree: t.Boolean(),
        assistanceConfiguree: t.Boolean(),
      }),
      404: t.Object({ message: t.String() }),
    },
    detail: { summary: 'Procédure applicable, avancement et échéances d\'un incident' },
  })
  // Endpoint léger pour la pastille d'onglet : les échéances seules, sans la checklist.
  .get('/incidents/:id/echeances', async ({ params, status }) => {
    const [incident] = await db.select().from(mainSchema.incident)
      .where(eq(mainSchema.incident.id, params.id)).limit(1)
    if (!incident) return status(404, { message: 'Incident introuvable.' })
    return echeancesPour(incident, await decisionsPour(incident.id), await nis2ArmeDepuis()).map(avecCourt)
  }, {
    auth: ['lecteur', 'gestionnaire', 'admin', 'svc'],
    response: { 200: t.Array(Echeance), 404: t.Object({ message: t.String() }) },
    detail: { summary: 'Échéances réglementaires d\'un incident' },
  })
  // COMPTEURS EN LOT — lus par le registre de conformité, qui n'écrit rien.
  //
  // Sous `/api/echeances` et non `/api/incidents/…` : le paramètre `:id` capturerait une route
  // en lot placée sous le même préfixe, et le lecteur recevrait un sous-ensemble sans erreur.
  .get('/echeances', async ({ query }) => {
    const I = mainSchema.incident
    const limit = Math.min(query.limit ?? 200, 1000)
    const offset = query.offset ?? 0
    const depuis = query.depuis ? new Date(query.depuis) : null
    if (depuis && Number.isNaN(depuis.getTime())) {
      return { total: 0, etat: { derniereDecision: null, incidentsSansDecision: 0 }, resultats: [] }
    }

    const filtre = depuis ? gte(I.knowledgeAt, depuis) : undefined

    const [compte] = await db.select({ total: sql<number>`count(*)::int` }).from(I).where(filtre)

    const incidents = await db.select({
      id: I.id, type: I.type, severity: I.severity, statut: I.status,
      knowledgeAt: I.knowledgeAt, knowledgeEstimated: I.knowledgeEstimated, source: I.source,
    })
      .from(I)
      .where(filtre)
      .orderBy(desc(I.knowledgeAt))
      .limit(limit)
      .offset(offset)

    // Une seule requête pour toutes les décisions de la page : autant d'allers-retours que
    // d'incidents rendrait la relecture périodique inutilement coûteuse.
    const ids = incidents.map(i => i.id)
    const lignes = ids.length
      ? await db.select().from(echeancesSchema.incidentEcheance)
          .where(inArray(echeancesSchema.incidentEcheance.incidentId, ids))
      : []

    const armeDepuis = await nis2ArmeDepuis()

    const parIncident = new Map<string, Record<string, DecisionEcheance>>()
    for (const l of lignes) {
      const m = parIncident.get(l.incidentId) ?? {}
      m[l.cle] = {
        applicable: l.applicable, decidePar: l.decidePar, decideLe: l.decideLe,
        deposeLe: l.deposeLe, reference: l.reference, deposePar: l.deposePar,
      }
      parIncident.set(l.incidentId, m)
    }

    // « Rien à signaler » et « personne n'a encore tranché » ne se ressemblent que pour qui
    // ne peut pas les distinguer : ce compte est ce qui les sépare.
    const [etatBrut] = await db.select({
      derniereDecision: sql<Date | null>`max(${echeancesSchema.incidentEcheance.decideLe})`,
    }).from(echeancesSchema.incidentEcheance)

    const [sansDecision] = await db.select({ n: sql<number>`count(*)::int` })
      .from(I)
      .where(and(
        filtre,
        sql`NOT EXISTS (SELECT 1 FROM ${echeancesSchema.incidentEcheance} e WHERE e.incident_id = ${I.id})`,
      ))

    return {
      total: compte?.total ?? 0,
      etat: {
        derniereDecision: etatBrut?.derniereDecision?.toISOString() ?? null,
        incidentsSansDecision: sansDecision?.n ?? 0,
      },
      resultats: incidents.map(i => ({
        incidentId: i.id,
        type: i.type,
        severity: i.severity,
        niveau: NIVEAU_P[i.severity as keyof typeof NIVEAU_P] ?? 'P?',
        knowledgeAt: i.knowledgeAt?.toISOString() ?? null,
        knowledgeEstimated: i.knowledgeEstimated,
        statut: i.statut,
        // Les cinq compteurs sont TOUJOURS rendus, y compris `applicable: null` : un
        // compteur absent du tableau se lirait comme non applicable, l'erreur exacte que
        // l'état à trois valeurs existe pour supprimer.
        echeances: echeancesPour(i, parIncident.get(i.id) ?? {}, armeDepuis).map(avecCourt),
      })),
    }
  }, {
    auth: ['admin', 'svc'],
    query: t.Object({
      depuis: t.Optional(t.String({ description: 'Ne retenir que les incidents connus depuis cette date (ISO 8601)' })),
      limit: t.Optional(t.Number({ description: 'Taille de page, 200 par défaut, 1000 au plus' })),
      offset: t.Optional(t.Number()),
    }),
    detail: {
      summary: 'Compteurs réglementaires de tous les incidents',
      description: "Destiné au registre de conformité, en lecture seule. Les cinq compteurs sont rendus pour chaque incident, `applicable: null` compris — un compteur absent se lirait comme non applicable. `defaut` (ce que la grille prévoit) et `applicable` (ce qu'un humain a tranché) restent distincts : un compteur armé d'office est une présomption, pas une décision. `etat.incidentsSansDecision` sépare « rien à signaler » de « personne n'a encore tranché ».",
    },
  })
  // Trancher l'applicabilité d'un compteur. La grille laisse des cas ouverts — NIS2 en P2,
  // le RGPD dès qu'il y a doute — et Slowpoke ne peut pas les trancher seul.
  .patch('/incidents/:id/echeances/:cle', async ({ params, body, user, status }) => {
    const [incident] = await db.select({ id: mainSchema.incident.id }).from(mainSchema.incident)
      .where(eq(mainSchema.incident.id, params.id)).limit(1)
    if (!incident) return status(404, { message: 'Incident introuvable.' })

    const valeurs = { applicable: body.applicable, decidePar: user?.id, decideLe: new Date() }
    await db.insert(echeancesSchema.incidentEcheance)
      .values({ incidentId: params.id, cle: params.cle, ...valeurs })
      .onConflictDoUpdate({
        target: [echeancesSchema.incidentEcheance.incidentId, echeancesSchema.incidentEcheance.cle],
        set: valeurs,
      })

    return { applicable: body.applicable }
  }, {
    auth: ['gestionnaire', 'admin'],
    body: t.Object({ applicable: t.Boolean() }),
    response: { 200: t.Object({ applicable: t.Boolean() }), 404: t.Object({ message: t.String() }) },
    detail: { summary: 'Déclarer un compteur réglementaire applicable ou non' },
  })
  // Enregistrer le DÉPÔT d'une déclaration — distinct de son applicabilité. Il se fait pendant
  // la conduite de l'incident, dans l'écran que la personne a sous les yeux.
  .patch('/incidents/:id/echeances/:cle/depot', async ({ params, body, user, status }) => {
    const [incident] = await db.select({ id: mainSchema.incident.id }).from(mainSchema.incident)
      .where(eq(mainSchema.incident.id, params.id)).limit(1)
    if (!incident) return status(404, { message: 'Incident introuvable.' })

    // Un dépôt effacé remet le compteur à courir : c'est une correction de saisie, pas une
    // annulation de déclaration. On efface donc aussi la référence, qui n'a plus d'objet.
    const efface = body.deposeLe === null
    if (!efface && body.deposeLe && Number.isNaN(new Date(body.deposeLe).getTime())) {
      return status(422, { message: 'Date de dépôt invalide.' })
    }

    const depot = {
      deposeLe: efface ? null : new Date(body.deposeLe!),
      reference: efface ? null : (body.reference?.trim() || null),
      deposePar: efface ? null : user?.id,
    }

    // Déposer une déclaration vaut décision d'applicabilité : on ne déclare pas un compteur
    // qu'on juge hors sujet. Mais si quelqu'un a déjà tranché, sa décision n'est pas touchée.
    await db.insert(echeancesSchema.incidentEcheance)
      .values({ incidentId: params.id, cle: params.cle, applicable: true, decidePar: user?.id, ...depot })
      .onConflictDoUpdate({
        target: [echeancesSchema.incidentEcheance.incidentId, echeancesSchema.incidentEcheance.cle],
        set: depot,
      })

    await createLog(params.id, 'update', user?.id, undefined, efface
      ? `Dépôt retiré sur « ${params.cle} »`
      : `Déclaration déposée pour « ${params.cle} »${depot.reference ? ` — référence ${depot.reference}` : ''}`)

    return { deposeLe: depot.deposeLe?.toISOString() ?? null, reference: depot.reference }
  }, {
    auth: ['gestionnaire', 'admin'],
    body: t.Object({
      deposeLe: t.Union([t.String(), t.Null()], { description: 'Date du dépôt effectif, ou `null` pour le retirer' }),
      reference: t.Optional(t.Union([t.String(), t.Null()], { description: "Référence rendue par l'autorité" })),
    }),
    response: {
      200: t.Object({ deposeLe: t.Union([t.String(), t.Null()]), reference: t.Union([t.String(), t.Null()]) }),
      404: t.Object({ message: t.String() }),
      422: t.Object({ message: t.String() }),
    },
    detail: {
      summary: 'Enregistrer le dépôt d\'une déclaration réglementaire',
      description: "Un jalon déposé cesse de courir : `court` passe à faux. `deposeLe: null` retire le dépôt et relance le compteur — correction de saisie, pas annulation de déclaration.",
    },
  })
  // Revenir au défaut de la grille : on efface la décision au lieu d'en poser une autre,
  // sinon « choisi » et « jamais examiné » deviennent indiscernables.
  .delete('/incidents/:id/echeances/:cle', async ({ params }) => {
    await db.delete(echeancesSchema.incidentEcheance).where(and(
      eq(echeancesSchema.incidentEcheance.incidentId, params.id),
      eq(echeancesSchema.incidentEcheance.cle, params.cle),
    ))
    return { efface: true }
  }, {
    auth: ['gestionnaire', 'admin'],
    response: { 200: t.Object({ efface: t.Boolean() }) },
    detail: { summary: 'Revenir à l\'applicabilité prévue par la grille' },
  })
  .patch('/incidents/:id/conduite/cases/:cle', async ({ params, body, user, status }) => {
    const [incident] = await db.select({ id: mainSchema.incident.id }).from(mainSchema.incident)
      .where(eq(mainSchema.incident.id, params.id)).limit(1)
    if (!incident) return status(404, { message: 'Incident introuvable.' })

    const valeurs = {
      fait: body.fait,
      faitPar: body.fait ? user?.id : null,
      faitLe: body.fait ? new Date() : null,
    }

    await db.insert(playbooksSchema.incidentChecklistItem)
      .values({ incidentId: params.id, playbookReference: body.checklist, cle: params.cle, ...valeurs })
      .onConflictDoUpdate({
        target: [
          playbooksSchema.incidentChecklistItem.incidentId,
          playbooksSchema.incidentChecklistItem.playbookReference,
          playbooksSchema.incidentChecklistItem.cle,
        ],
        set: valeurs,
      })

    return { fait: body.fait }
  }, {
    auth: ['gestionnaire', 'admin'],
    body: t.Object({ fait: t.Boolean(), checklist: t.String() }),
    response: { 200: t.Object({ fait: t.Boolean() }), 404: t.Object({ message: t.String() }) },
    detail: { summary: 'Cocher ou décocher une case de la checklist' },
  })
  .post('/playbooks/sync', async () => {
    return await synchroniserPlaybooks()
  }, {
    auth: ['admin'],
    response: { 200: t.Object({ vues: t.Number(), ecrites: t.Number(), inchangees: t.Number(), echecs: t.Number() }) },
    detail: { summary: 'Synchroniser les procédures depuis GitLab' },
  })
  // COMMENT LIRE CE QUE L'API REND.
  //
  // Une valeur juste, lue de travers, produit une réponse fausse : `severity: "critical"` se
  // lit « pas de P1 » sur un incident qui en est un. L'entrée est le couple (champ, valeur),
  // jamais la route : une consigne accrochée aux routes ne vaut que pour celles auxquelles on
  // a pensé.
  .get('/lectures', () => ({
    total: LECTURES.length,
    // Les vocabulaires fermés sont garantis complets par le compilateur ; les champs
    // ambigus se tiennent à la main. Le dire évite de prendre l'un pour l'autre.
    garantie: {
      vocabulairesFermes: true,
      champsAmbigus: false,
      explication: "Toute valeur d'un vocabulaire fermé (severity, status, resolution, applicabilité) est nécessairement décrite, et porte un `libelle` court dérivé des mêmes tables que l'interface : en ajouter une sans sa lecture ne compile pas. Aucun mécanisme n'impose la même chose à un champ nouvellement ajouté — cette moitié de la liste peut donc être incomplète, et ses entrées n'ont pas toutes de `libelle`.",
    },
    lectures: LECTURES,
    // Les filtres disponibles, par catalogue. Un appelant qui ignore qu'un filtre existe ne
    // pose pas la question : il rapatrie tout et trie lui-même, ou renonce.
    filtres: FILTRES,
  }), {
    auth: ['lecteur', 'gestionnaire', 'admin', 'svc'],
    response: {
      200: t.Object({
        total: t.Number(),
        garantie: t.Object({
          vocabulairesFermes: t.Boolean(),
          champsAmbigus: t.Boolean(),
          explication: t.String(),
        }),
        lectures: t.Array(t.Object({
          cle: t.String({ description: 'Identifiant stable de la mise en garde' }),
          champ: t.String({ description: 'Nom du champ dans la charge utile' }),
          valeur: t.String({ description: "Valeur concernée, `*` si la mise en garde vaut pour toutes" }),
          libelle: t.Optional(t.String({ description: "Libellé court — deux ou trois mots, pour une pastille. Dérivé des mêmes tables que l'interface de Slowpoke, pour qu'un lecteur extérieur n'ait pas à tenir le sien. Toujours présent sur les vocabulaires fermés." })),
          signifie: t.String(),
          neSignifiePas: t.String({ description: 'La lecture naïve, à refuser' }),
          consequence: t.String({ description: "Ce qu'une réponse doit dire, ou taire" }),
          ouCorriger: t.String(),
        })),
        filtres: t.Array(t.Object({
          routes: t.Array(t.String()),
          description: t.String(),
          filtres: t.Array(t.Object({
            champ: t.String(),
            nature: t.Union([
              t.Literal('vocabulaire'), t.Literal('referentiel'), t.Literal('booleen'),
              t.Literal('nombre'), t.Literal('texte'), t.Literal('date'),
            ]),
            valeurs: t.Optional(t.Array(t.String({ description: "Valeurs admises, dérivées de l'énumération" }))),
            pointEntree: t.Optional(t.String({ description: 'Où obtenir les identifiants valides' })),
            description: t.String(),
          })),
          commentCroiser: t.String(),
          neJamaisFaire: t.Array(t.String()),
        })),
      }),
    },
    detail: {
      summary: "Comment lire les valeurs rendues par l'API",
      description: "Contresens connus, par couple (champ, valeur) et non par route — une consigne accrochée à des routes nommées une par une rate la suivante. `neSignifiePas` porte la lecture naïve, qui est presque toujours la fausse. Les vocabulaires fermés sont garantis complets par le compilateur ; `garantie.champsAmbigus` vaut `false` car rien n'impose qu'un champ nouvellement ajouté soit décrit ici.",
    },
  })
  .get('/playbooks', async () => {
    const docs = await db.select({
      reference: playbooksSchema.playbook.reference,
      titre: playbooksSchema.playbook.titre,
      version: playbooksSchema.playbook.version,
      statut: playbooksSchema.playbook.statut,
      niveaux: playbooksSchema.playbook.niveaux,
      synchroniseLe: playbooksSchema.playbook.synchroniseLe,
    }).from(playbooksSchema.playbook)
    return docs.map(d => ({ ...d, niveaux: d.niveaux ?? [], synchroniseLe: d.synchroniseLe.toISOString() }))
  }, {
    auth: ['lecteur', 'gestionnaire', 'admin'],
    response: {
      200: t.Array(t.Object({
        reference: t.String(),
        titre: t.String(),
        version: t.Union([t.String(), t.Null()]),
        statut: t.Union([t.String(), t.Null()]),
        niveaux: t.Array(t.String()),
        synchroniseLe: t.String(),
      })),
    },
    detail: { summary: 'Procédures disponibles localement' },
  })
