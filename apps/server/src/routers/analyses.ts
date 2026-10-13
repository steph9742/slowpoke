import { Elysia, t } from 'elysia'
import { betterAuth } from '../middleware/auth'
import { db } from '@slowpoke/database'
import { mainSchema, incidentsSchema, analysesSchema, playbooksSchema, chatSchema } from '@slowpoke/database/tables'
import { and, asc, desc, eq, count, isNull } from 'drizzle-orm'
import { lireConfigIA, resumer, extraireIocs, situerAvancement, suggererProcedure, repondre, VERSION_PROMPT } from '../utils/ia'
import { analyserCases } from '../utils/playbooks'
import { procedurePour, TOUTES_PROCEDURES } from '../utils/conduite'

// Analyses produites par le modèle. Elles sont STOCKÉES et affichées à part : rien n'est
// écrit dans les champs de l'incident, qui restent le constat de la cellule.

const GENRES = ['resume', 'iocs', 'avancement', 'procedure'] as const
type Genre = typeof GENRES[number]

/**
 * Ce que le modèle voit de l'incident. On ne lui donne que ce qui sert à la tâche : ni
 * identifiants internes, ni journal, ni pièces jointes.
 */
async function blocIncident(id: string): Promise<string | null> {
  const [i] = await db.select().from(mainSchema.incident).where(eq(mainSchema.incident.id, id)).limit(1)
  if (!i) return null

  const lignes = [
    `Type : ${i.type}`,
    `Gravité : ${i.severity}`,
    `Statut : ${i.status}${i.resolution ? ` (${i.resolution})` : ''}`,
    i.perimeter ? `Périmètre : ${i.perimeter}` : '',
    i.knowledgeAt ? `Connaissance : ${i.knowledgeAt.toISOString()}` : 'Connaissance : non renseignée',
    i.source ? `Source : ${i.source}` : '',
    i.pilot ? 'Un pilote est désigné.' : 'Aucun pilote désigné.',
    i.description ? `\nDescription :\n${i.description}` : '',
  ]

  const utilisateurs = await db.select({ nom: mainSchema.incidentUser.fullName })
    .from(mainSchema.incidentUser).where(eq(mainSchema.incidentUser.incidentId, id))
  if (utilisateurs.length) lignes.push(`\nComptes concernés : ${utilisateurs.length}`)

  const [malware] = await db.select().from(incidentsSchema.malwareIncident)
    .where(eq(incidentsSchema.malwareIncident.incidentId, id)).limit(1)
  const [intrusion] = await db.select().from(incidentsSchema.intrusionIncident)
    .where(eq(incidentsSchema.intrusionIncident.incidentId, id)).limit(1)

  const machines = [...(malware?.machines ?? []), ...(intrusion?.machines ?? [])]
  const iocs = [...(malware?.iocs ?? []), ...(malware?.c2 ?? []), ...(intrusion?.sourceIps ?? [])]
  if (machines.length) lignes.push(`Machines : ${machines.join(', ')}`)
  if (iocs.length) lignes.push(`Indicateurs déjà relevés : ${iocs.join(', ')}`)

  const extension = await db.select().from(mainSchema.incidentExtension)
    .where(eq(mainSchema.incidentExtension.incidentId, id)).limit(1)
  const champs = extension[0]?.customFields as Record<string, unknown> | undefined
  for (const [cle, valeur] of Object.entries(champs ?? {})) {
    if (typeof valeur === 'string' && valeur.trim()) lignes.push(`\n${cle} :\n${valeur}`)
  }

  return lignes.filter(Boolean).join('\n')
}

async function corpsChecklist(reference: string): Promise<string | null> {
  const [d] = await db.select({ corps: playbooksSchema.playbook.corps })
    .from(playbooksSchema.playbook)
    .where(eq(playbooksSchema.playbook.reference, reference)).limit(1)
  return d?.corps ?? null
}

export const analysesRouter = new Elysia({ name: 'analyses', prefix: '/api', tags: ['Assistance'] })
  .use(betterAuth)
  .get('/incidents/:id/analyses', async ({ params }) => {
    const toutes = await db.select().from(analysesSchema.incidentAnalysis)
      .where(eq(analysesSchema.incidentAnalysis.incidentId, params.id))
      .orderBy(desc(analysesSchema.incidentAnalysis.creeLe))

    // La plus récente par genre : les précédentes restent en base pour l'historique.
    const derniere = new Map<string, typeof toutes[number]>()
    for (const a of toutes) if (!derniere.has(a.genre)) derniere.set(a.genre, a)

    return [...derniere.values()].map(a => ({
      genre: a.genre,
      contenu: a.contenu,
      modele: a.modele,
      versionPrompt: a.versionPrompt,
      creeLe: a.creeLe.toISOString(),
    }))
  }, {
    auth: ['lecteur', 'gestionnaire', 'admin', 'svc'],
    response: {
      200: t.Array(t.Object({
        genre: t.String(),
        contenu: t.Unknown(),
        modele: t.String(),
        versionPrompt: t.String(),
        creeLe: t.String(),
      })),
    },
    detail: { summary: 'Dernière analyse de chaque genre pour un incident' },
  })
  .post('/incidents/:id/analyses/:genre', async ({ params, body, user, status }) => {
    if (!GENRES.includes(params.genre as Genre)) return status(400, { message: 'Genre d\'analyse inconnu.' })

    const cfg = await lireConfigIA()
    if (!cfg) return status(400, { message: 'L\'assistance n\'est pas configurée.' })

    const bloc = await blocIncident(params.id)
    if (!bloc) return status(404, { message: 'Incident introuvable.' })

    const depart = Date.now()
    console.log(`⏳ Assistance : « ${params.genre} » sur ${params.id} — demande reçue.`)

    const [incident] = await db.select().from(mainSchema.incident)
      .where(eq(mainSchema.incident.id, params.id)).limit(1)

    try {
      let contenu: unknown
      switch (params.genre as Genre) {
        case 'resume':
          contenu = await resumer(cfg, bloc)
          break
        case 'iocs':
          contenu = await extraireIocs(cfg, bloc)
          break
        case 'procedure':
          contenu = await suggererProcedure(cfg, bloc,
            TOUTES_PROCEDURES.map(p => ({ checklist: p.checklist, motif: p.motif })))
          break
        case 'avancement': {
          const [{ n } = { n: 0 }] = await db.select({ n: count() })
            .from(mainSchema.incidentUser)
            .where(eq(mainSchema.incidentUser.incidentId, params.id))
          const reference = body?.checklist ?? procedurePour(incident!, Number(n)).checklist
          const corps = await corpsChecklist(reference)
          if (!corps) return status(400, { message: `Checklist ${reference} absente. Synchronisez les procédures.` })
          // Les cases déjà cochées n'ont pas à être réévaluées : l'analyste a tranché.
          const cochees = await db.select({ cle: playbooksSchema.incidentChecklistItem.cle })
            .from(playbooksSchema.incidentChecklistItem)
            .where(and(
              eq(playbooksSchema.incidentChecklistItem.incidentId, params.id),
              eq(playbooksSchema.incidentChecklistItem.playbookReference, reference),
              eq(playbooksSchema.incidentChecklistItem.fait, true),
            ))
          const faites = new Set(cochees.map(c => c.cle))
          const restantes = analyserCases(corps).filter(c => !faites.has(c.cle))
          contenu = { checklist: reference, cases: await situerAvancement(cfg, bloc, corps, restantes) }
          break
        }
      }

      console.log(`✅ Assistance : « ${params.genre} » sur ${params.id} — modèle répondu en ${Math.round((Date.now() - depart) / 1000)} s.`)

      const [enregistree] = await db.insert(analysesSchema.incidentAnalysis).values({
        incidentId: params.id,
        genre: params.genre,
        contenu: contenu as object,
        modele: cfg.modele,
        versionPrompt: VERSION_PROMPT,
        creePar: user?.id,
      }).returning()

      return {
        genre: params.genre,
        contenu: enregistree!.contenu,
        modele: enregistree!.modele,
        versionPrompt: enregistree!.versionPrompt,
        creeLe: enregistree!.creeLe.toISOString(),
      }
    }
    catch (e) {
      // Tracé AUSSI côté serveur : renvoyer la cause au navigateur ne suffit pas, une
      // requête coupée en chemin n'affiche rien et ne laisse alors aucune trace.
      console.error(`❌ Assistance : « ${params.genre} » sur ${params.id} après ${Math.round((Date.now() - depart) / 1000)} s :`, e)
      return status(400, { message: e instanceof Error ? e.message : 'Analyse impossible.' })
    }
  }, {
    auth: ['gestionnaire', 'admin'],
    body: t.Optional(t.Object({ checklist: t.Optional(t.String()) })),
    response: {
      200: t.Object({
        genre: t.String(),
        contenu: t.Unknown(),
        modele: t.String(),
        versionPrompt: t.String(),
        creeLe: t.String(),
      }),
      400: t.Object({ message: t.String() }),
      404: t.Object({ message: t.String() }),
    },
    detail: { summary: 'Demander une analyse au modèle' },
  })

// --- Conversation : hors de la chronologie, délibérément. Le journal d'incident est une
// pièce de dossier. Deux fils par incident — un partagé, et celui de chaque analyste. ---

const Message = t.Object({
  role: t.String(),
  contenu: t.String(),
  auteur: t.Union([t.String(), t.Null()]),
  modele: t.Union([t.String(), t.Null()]),
  creeLe: t.String(),
})

const portee = (partagee: boolean, userId?: string) =>
  partagee ? isNull(chatSchema.incidentChat.proprietaire) : eq(chatSchema.incidentChat.proprietaire, userId ?? '')

export const chatRouter = new Elysia({ name: 'chat', prefix: '/api', tags: ['Assistance'] })
  .use(betterAuth)
  .get('/incidents/:id/chat', async ({ params, query, user }) => {
    const messages = await db.select().from(chatSchema.incidentChat)
      .where(and(
        eq(chatSchema.incidentChat.incidentId, params.id),
        portee(query.partagee === 'true', user?.id),
      ))
      .orderBy(asc(chatSchema.incidentChat.creeLe))

    return messages.map(m => ({
      role: m.role,
      contenu: m.contenu,
      auteur: m.auteur,
      modele: m.modele,
      creeLe: m.creeLe.toISOString(),
    }))
  }, {
    auth: ['lecteur', 'gestionnaire', 'admin'],
    query: t.Object({ partagee: t.Optional(t.String()) }),
    response: { 200: t.Array(Message) },
    detail: { summary: 'Fil de conversation d\'un incident (partagé ou personnel)' },
  })
  .post('/incidents/:id/chat', async ({ params, body, user, status }) => {
    const cfg = await lireConfigIA()
    if (!cfg) return status(400, { message: 'L\'assistance n\'est pas configurée.' })

    const bloc = await blocIncident(params.id)
    if (!bloc) return status(404, { message: 'Incident introuvable.' })

    const partagee = body.partagee === true
    const proprietaire = partagee ? null : user?.id ?? null
    if (!partagee && !proprietaire) return status(400, { message: 'Fil personnel indisponible hors session.' })

    const historique = await db.select().from(chatSchema.incidentChat)
      .where(and(eq(chatSchema.incidentChat.incidentId, params.id), portee(partagee, user?.id)))
      .orderBy(asc(chatSchema.incidentChat.creeLe))

    // La procédure accompagne la question : sans elle, le modèle répond de culture générale.
    const [incident] = await db.select().from(mainSchema.incident)
      .where(eq(mainSchema.incident.id, params.id)).limit(1)
    const [{ n } = { n: 0 }] = await db.select({ n: count() })
      .from(mainSchema.incidentUser).where(eq(mainSchema.incidentUser.incidentId, params.id))
    const procedure = await corpsChecklist(procedurePour(incident!, Number(n)).checklist)

    try {
      const reponse = await repondre(
        cfg, bloc, procedure,
        historique.map(m => ({ role: m.role as 'user' | 'assistant', contenu: m.contenu })),
        body.question,
      )

      await db.insert(chatSchema.incidentChat).values([
        { incidentId: params.id, proprietaire, role: 'user', contenu: body.question, auteur: user?.id },
        { incidentId: params.id, proprietaire, role: 'assistant', contenu: reponse, modele: cfg.modele },
      ])

      return { reponse, modele: cfg.modele }
    }
    catch (e) {
      console.error(`❌ Assistance : conversation sur ${params.id} :`, e)
      return status(400, { message: e instanceof Error ? e.message : 'Le modèle n\'a pas répondu.' })
    }
  }, {
    auth: ['gestionnaire', 'admin'],
    body: t.Object({ question: t.String({ minLength: 1, maxLength: 2000 }), partagee: t.Optional(t.Boolean()) }),
    response: {
      200: t.Object({ reponse: t.String(), modele: t.String() }),
      400: t.Object({ message: t.String() }),
      404: t.Object({ message: t.String() }),
    },
    detail: { summary: 'Poser une question sur un incident' },
  })
  .delete('/incidents/:id/chat', async ({ params, query, user }) => {
    await db.delete(chatSchema.incidentChat).where(and(
      eq(chatSchema.incidentChat.incidentId, params.id),
      portee(query.partagee === 'true', user?.id),
    ))
    return { efface: true }
  }, {
    auth: ['gestionnaire', 'admin'],
    query: t.Object({ partagee: t.Optional(t.String()) }),
    response: { 200: t.Object({ efface: t.Boolean() }) },
    detail: { summary: 'Effacer un fil de conversation' },
  })
