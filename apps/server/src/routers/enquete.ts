import { Elysia, t } from 'elysia'
import { betterAuth } from '../middleware/auth'
import { createLog } from '../utils/log'
import { etapesEnquete, lancerEtape, enregistrerVerdict } from '../utils/enquete'

// ENQUÊTE GUIDÉE — l'onglet « Enquête » d'un incident. La logique vit dans
// `utils/enquete.ts`, où elle se teste contre une base ; ici, les droits et la chronologie.

const LIBELLES_VERDICT: Record<string, string> = {
  aucun: 'rien trouvé',
  trouve: 'trouvé',
  impossible: 'impossible à vérifier',
}

export const enqueteRouter = new Elysia({ name: 'enquete', prefix: '/api', tags: ['Enquête'] })
  .use(betterAuth)
  .get('/incidents/:id/enquete', async ({ params, query, status }) => {
    const r = await etapesEnquete(params.id, query.checklist)
    if (!r) return status(404, { message: 'Incident introuvable.' })
    return r
  }, {
    auth: ['lecteur', 'gestionnaire', 'admin', 'svc'],
    params: t.Object({ id: t.String() }),
    query: t.Object({ checklist: t.Optional(t.String()) }),
    detail: {
      summary: "Étapes d'enquête outillées de la checklist applicable",
      description: "Les cases de la checklist qui portent un bloc `enquete`, avec la requête de la bibliothèque, sa version, et le dernier état enregistré : résultat et verdict.",
    },
  })
  .post('/incidents/:id/enquete/:cle/lancer', async ({ params, body, user, status }) => {
    const r = await lancerEtape(params.id, params.cle, user?.id, body?.checklist)
    if ('erreur' in r) return status(r.code, { message: r.erreur })
    const bilan = r.execution.etat === 'execute'
      ? `${r.execution.nombre} résultat(s)`
      : r.execution.etat === 'guidee'
        ? 'vérification à la main'
        : `non exécutée — ${r.execution.motif}`
    await createLog(params.id, 'enquete_etape', user?.id, undefined, `Enquête — ${r.titre} : ${bilan}`, undefined, { silent: true })
    return r
  }, {
    auth: ['gestionnaire', 'admin'],
    params: t.Object({ id: t.String(), cle: t.String() }),
    body: t.Optional(t.Object({ checklist: t.Optional(t.String()) })),
    detail: {
      summary: "Lancer la recherche d'une étape",
      description: "Exécute la requête de la bibliothèque en lecture seule, avec les paramètres de l'incident. Le résultat et la version de la requête sont enregistrés, et la chronologie en garde la trace.",
    },
  })
  .put('/incidents/:id/enquete/:cle/verdict', async ({ params, body, user, status }) => {
    const r = await enregistrerVerdict(params.id, params.cle, body.verdict, body.motif, user?.id, body.checklist)
    if ('erreur' in r) return status(r.code, { message: r.erreur })
    const motif = r.motif ? ` (${r.motif})` : ''
    await createLog(params.id, 'enquete_etape', user?.id, undefined, `Enquête — ${r.texte} : ${LIBELLES_VERDICT[r.verdict] ?? r.verdict}${motif}`, undefined, { silent: true })
    return r
  }, {
    auth: ['gestionnaire', 'admin'],
    params: t.Object({ id: t.String(), cle: t.String() }),
    body: t.Object({
      verdict: t.Union([t.Literal('aucun'), t.Literal('trouve'), t.Literal('impossible')]),
      motif: t.Optional(t.String()),
      checklist: t.Optional(t.String()),
    }),
    detail: {
      summary: "Enregistrer le verdict d'une étape",
      description: "« Impossible à vérifier » exige un motif : sans lui, l'étape se lirait comme vérifiée. Le verdict est écrit dans la chronologie de l'incident.",
    },
  })
