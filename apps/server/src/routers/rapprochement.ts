import { Elysia, t } from 'elysia'
import { betterAuth } from '../middleware/auth'
import { db } from '@slowpoke/database'
import { exclusionsSchema, harfanglabSchema } from '@slowpoke/database/tables'
import { eq, and, desc, sql } from 'drizzle-orm'
import { rapprocher, suggererRegles, chercherRegles } from '../utils/rapprochement'
import { lireEtat, lireEtats } from '@slowpoke/connecteurs/synchro'
import { dispatchWebhooks } from '../utils/webhook'

// Rapprochement des listes blanches : ce que la cellule a consigné face à ce qui existe
// vraiment dans l'EDR. La vue MONTRE l'écart ; elle ne le comble pas.

const Etat = t.Object({
  cle: t.String(),
  dernierSucces: t.Union([t.String(), t.Null()]),
  dernierEssai: t.Union([t.String(), t.Null()]),
  dernierOk: t.Boolean(),
  derniereErreur: t.Union([t.String(), t.Null()]),
  echecsConsecutifs: t.Number(),
  dernierBilan: t.Union([t.String(), t.Null()]),
})

export const rapprochementRouter = new Elysia({ name: 'rapprochement', prefix: '/api', tags: ['Listes blanches'] })
  .use(betterAuth)
  .get('/exclusions/rapprochement', async () => {
    return await rapprocher()
  }, {
    auth: ['lecteur', 'gestionnaire', 'admin'],
    response: {
      200: t.Object({
        legitimesSansExclusion: t.Array(t.Object({
          id: t.String(), type: t.String(), severity: t.String(), closDepuis: t.String(),
        })),
        nonEnregistrees: t.Array(t.Object({
          ref: t.String(),
          libelle: t.Union([t.String(), t.Null()]),
          criteres: t.Array(t.String()),
          cible: t.Union([t.String(), t.Null()]),
          creeeLe: t.Union([t.String(), t.Null()]),
        })),
        disparues: t.Array(t.Object({
          id: t.String(), incidentId: t.String(), scope: t.String(),
          outilRef: t.String(), reviewDate: t.String(),
        })),
        nonRapprochees: t.Array(t.Object({
          id: t.String(), incidentId: t.String(), scope: t.String(), reviewDate: t.String(),
        })),
        volume: t.Object({ total: t.Number(), editeur: t.Number() }),
        etat: t.Union([Etat, t.Null()]),
        configure: t.Boolean(),
      }),
    },
    detail: { summary: 'Écart entre les exclusions consignées et les règles de l\'EDR' },
  })
  // Propositions d'appariement pour une exclusion non rapprochée. Elles ne s'appliquent
  // pas d'elles-mêmes : c'est le PATCH ci-dessous qui enregistre, sur décision humaine.
  .get('/exclusions/:id/suggestions', async ({ params }) => {
    return await suggererRegles(params.id)
  }, {
    auth: ['gestionnaire', 'admin'],
    response: {
      200: t.Array(t.Object({
        ref: t.String(),
        libelle: t.Union([t.String(), t.Null()]),
        criteres: t.Array(t.String()),
        raison: t.String(),
      })),
    },
    detail: { summary: 'Règles de l\'EDR pouvant correspondre à une exclusion' },
  })
  // INVENTAIRE COMPLET — lu par le registre des listes blanches.
  //
  // Tout est rendu, sans filtre : règles de l'éditeur et règles disparues comprises. Filtrer ici
  // rendrait l'absence indistinguable d'une règle inexistante, sans rattrapage possible en aval.
  //
  // Ce que Slowpoke est seul à détenir voyage avec : `presente` (la règle a-t-elle disparu) et
  // `exclusion` (l'appariement, y compris décidé à la main) — un jugement qu'on importe plutôt
  // que de le recalculer.
  .get('/harfanglab/regles', async ({ query }) => {
    const R = harfanglabSchema.harfanglabRule
    const X = exclusionsSchema.exclusion
    const limit = Math.min(query.limit ?? 200, 1000)
    const offset = query.offset ?? 0

    const [compte] = await db.select({ total: sql<number>`count(*)::int` }).from(R)

    const lignes = await db.select({
      ref: R.ref,
      libelle: R.libelle,
      criteres: R.criteres,
      cible: R.cible,
      active: R.active,
      fourniParEditeur: R.fourniParEditeur,
      creeeLe: R.creeeLe,
      presente: R.presente,
      tags: R.tags,
      champTags: R.champTags,
      exclusionId: X.id,
      exclusionIncidentId: X.incidentId,
      exclusionMotif: X.reason,
      exclusionReviewDate: X.reviewDate,
      exclusionState: X.state,
    })
      .from(R)
      .leftJoin(X, and(eq(X.outilRef, R.ref), eq(X.state, 'active')))
      .orderBy(desc(R.creeeLe), R.ref)
      .limit(limit)
      .offset(offset)

    return {
      total: compte?.total ?? 0,
      // Le témoin d'activité voyage avec l'inventaire : sans lui, une liste vide et un
      // connecteur en panne se ressemblent exactement.
      etat: await lireEtat('harfanglab'),
      resultats: lignes.map(l => ({
        ref: l.ref,
        // `libelle` et `commentaire` portent la même valeur : dans l'EDR, le commentaire
        // de la règle est ce qui lui tient lieu de libellé, il n'y a pas deux champs.
        libelle: l.libelle,
        commentaire: l.libelle,
        criteres: l.criteres ?? [],
        cible: l.cible,
        active: l.active,
        fourniParEditeur: l.fourniParEditeur,
        // La date de création DANS L'OUTIL, jamais celle de l'import : une règle posée il y
        // a trois ans et jamais réexaminée ne mérite pas une échéance repartie de zéro.
        creeeLe: l.creeeLe?.toISOString() ?? null,
        presente: l.presente,
        tags: l.tags ?? null,
        champTags: l.champTags,
        exclusion: l.exclusionId
          ? {
              id: l.exclusionId,
              incidentId: l.exclusionIncidentId!,
              motif: l.exclusionMotif!,
              reviewDate: l.exclusionReviewDate!.toISOString(),
              state: l.exclusionState!,
            }
          : null,
      })),
    }
  }, {
    auth: ['admin', 'svc'],
    query: t.Object({
      limit: t.Optional(t.Number({ description: 'Taille de page, 200 par défaut, 1000 au plus' })),
      offset: t.Optional(t.Number()),
    }),
    detail: {
      summary: "Inventaire complet des règles de liste blanche de l'EDR",
      description: "Rendu sans filtre — règles de l'éditeur et règles disparues comprises. `presente` dit si la règle existe encore dans l'EDR, `exclusion` porte l'appariement décidé dans Slowpoke, `etat` la date du dernier relevé et son résultat. Les étiquettes sont rendues telles quelles, avec le champ de l'API qui les portait (`champTags`, `null` si aucun n'existe) : elles ne sont pas interprétées ici.",
    },
  })

  // Recherche libre parmi les règles encore libres d'appariement. Les suggestions ne
  // rapprochent que ce qui se ressemble littéralement ; quand elles ne trouvent rien,
  // c'est ici qu'on choisit la règle soi-même.
  .get('/exclusions/regles-libres', async ({ query }) => {
    return await chercherRegles(query.q ?? '')
  }, {
    auth: ['gestionnaire', 'admin'],
    query: t.Object({ q: t.Optional(t.String({ description: 'Filtre sur le commentaire, la cible ou les critères' })) }),
    response: {
      200: t.Array(t.Object({
        ref: t.String(),
        libelle: t.Union([t.String(), t.Null()]),
        criteres: t.Array(t.String()),
        raison: t.String(),
      })),
    },
    detail: { summary: 'Chercher une règle de l\'EDR encore libre d\'appariement' },
  })
  .patch('/exclusions/:id/rapprocher', async ({ params, body, status }) => {
    const ref = body.outilRef?.trim() || null

    // Une règle ne porte qu'une décision active. Le dire ici, en nommant l'exclusion qui
    // la détient déjà, vaut mieux qu'une violation d'index remontée telle quelle.
    if (ref) {
      const [prise] = await db.select({ id: exclusionsSchema.exclusion.id, incidentId: exclusionsSchema.exclusion.incidentId })
        .from(exclusionsSchema.exclusion)
        .where(and(
          eq(exclusionsSchema.exclusion.outilRef, ref),
          eq(exclusionsSchema.exclusion.state, 'active'),
        ))
        .limit(1)
      if (prise && prise.id !== params.id) {
        return status(409, { message: `Cette règle est déjà appariée à l'exclusion de l'incident #${prise.incidentId}. Détachez-la d'abord.` })
      }
    }

    const [maj] = await db.update(exclusionsSchema.exclusion)
      // `null` détache : une erreur d'appariement doit pouvoir se défaire.
      .set({ outilRef: ref })
      .where(eq(exclusionsSchema.exclusion.id, params.id))
      .returning({ id: exclusionsSchema.exclusion.id, outilRef: exclusionsSchema.exclusion.outilRef })
    if (!maj) return status(404, { message: 'Exclusion introuvable.' })

    // L'appariement fait basculer l'autorité sur l'échéance vers Slowpoke. Le registre qui
    // l'apprendrait au relevé suivant vivrait tout un cycle avec une date périmée — et c'est
    // précisément pendant ce cycle que deux dates coexistent.
    const [detail] = await db.select({
        incidentId: exclusionsSchema.exclusion.incidentId,
        reason: exclusionsSchema.exclusion.reason,
        reviewDate: exclusionsSchema.exclusion.reviewDate,
        state: exclusionsSchema.exclusion.state,
      })
      .from(exclusionsSchema.exclusion)
      .where(eq(exclusionsSchema.exclusion.id, params.id))
      .limit(1)

    if (detail) {
      await dispatchWebhooks(
        detail.incidentId,
        ref ? 'exclusion_appariee' : 'exclusion_detachee',
        ref
          ? `Exclusion appariée à la règle ${ref} de l'EDR`
          : "Exclusion détachée de sa règle de l'EDR",
        undefined,
        {
          exclusion: {
            id: params.id,
            incidentId: detail.incidentId,
            outilRef: ref,
            motif: detail.reason,
            reviewDate: detail.reviewDate.toISOString(),
            state: detail.state,
          },
        },
      )
    }

    return { outilRef: maj.outilRef }
  }, {
    auth: ['gestionnaire', 'admin'],
    body: t.Object({ outilRef: t.Union([t.String(), t.Null()]) }),
    response: {
      200: t.Object({ outilRef: t.Union([t.String(), t.Null()]) }),
      404: t.Object({ message: t.String() }),
      409: t.Object({ message: t.String() }),
    },
    detail: {
      summary: 'Apparier une exclusion à une règle de l\'EDR, ou l\'en détacher',
      description: "Une règle ne porte qu'une décision active : l'apparier à une seconde exclusion est refusé en 409, en nommant l'incident qui la détient.",
    },
  })
  // État de TOUTES les synchronisations : une liste vide ne dit pas d'elle-même si tout
  // va bien ou si la dernière lecture a échoué.
  .get('/synchronisations', async () => {
    return await lireEtats()
  }, {
    auth: ['lecteur', 'gestionnaire', 'admin'],
    response: { 200: t.Array(Etat) },
    detail: { summary: 'Dernier passage de chaque synchronisation' },
  })
