import { Elysia, t } from 'elysia'
import { betterAuth } from '../middleware/auth'
import { db } from '@slowpoke/database'
import { mainSchema, glpiSchema } from '@slowpoke/database/tables'
import { and, asc, desc, eq } from 'drizzle-orm'
import { chercherMachines, lireConfigGlpi } from '../utils/glpi'
import { _selectIncident } from '../models/incident'

// Machines rattachées à un incident.
//
// La recherche interroge la copie locale, pas GLPI : elle répond instantanément et fonctionne
// quand GLPI ne répond plus. Rattacher un nom absent de l'inventaire reste normal.

export const Machine = t.Object({
  nom: t.String(),
  glpiId: t.Union([t.String(), t.Null()]),
  groupe: t.Union([t.String(), t.Null()]),
  entite: t.Union([t.String(), t.Null()]),
  lieu: t.Union([t.String(), t.Null()]),
  type: t.Union([t.String(), t.Null()]),
  os: t.Union([t.String(), t.Null()]),
  critique: t.Boolean(),
  presente: t.Boolean(),
  url: t.Union([t.String(), t.Null()]),
})

export const machinesRouter = new Elysia({ name: 'machines', prefix: '/api', tags: ['Machines'] })
  .use(betterAuth)
  .get('/machines/recherche', async ({ query }) => {
    return await chercherMachines(query.q ?? '')
  }, {
    auth: ['lecteur', 'gestionnaire', 'admin'],
    query: t.Object({ q: t.Optional(t.String()) }),
    response: {
      200: t.Array(t.Object({
        glpiId: t.String(), nom: t.String(),
        groupe: t.Union([t.String(), t.Null()]), entite: t.Union([t.String(), t.Null()]),
        lieu: t.Union([t.String(), t.Null()]), type: t.Union([t.String(), t.Null()]),
        os: t.Union([t.String(), t.Null()]), critique: t.Boolean(),
        presente: t.Boolean(), url: t.Union([t.String(), t.Null()]),
      })),
    },
    detail: { summary: 'Chercher une machine dans l\'inventaire local' },
  })
  .get('/incidents/:id/machines', async ({ params }) => {
    const cfg = await lireConfigGlpi()
    const lignes = await db.select({
      nom: glpiSchema.incidentMachine.nom,
      glpiId: glpiSchema.incidentMachine.glpiId,
      inventaire: glpiSchema.glpiMachine,
    })
      .from(glpiSchema.incidentMachine)
      // Jointure externe : une machine saisie librement n'a pas d'entrée d'inventaire,
      // et doit malgré tout s'afficher.
      .leftJoin(glpiSchema.glpiMachine, eq(glpiSchema.incidentMachine.glpiId, glpiSchema.glpiMachine.glpiId))
      .where(eq(glpiSchema.incidentMachine.incidentId, params.id))
      .orderBy(asc(glpiSchema.incidentMachine.nom))

    return lignes.map(l => ({
      // Le nom enregistré au rattachement prime : il reste lisible même si l'inventaire
      // a changé ou disparu.
      nom: l.nom,
      glpiId: l.glpiId,
      groupe: l.inventaire?.groupeComplet ?? l.inventaire?.groupe ?? null,
      entite: l.inventaire?.entiteComplet ?? l.inventaire?.entite ?? null,
      lieu: l.inventaire?.lieuComplet ?? l.inventaire?.lieu ?? null,
      type: l.inventaire?.type ?? null,
      os: l.inventaire?.os ?? null,
      critique: l.inventaire?.critique ?? false,
      presente: l.inventaire?.presente ?? false,
      url: cfg && l.glpiId ? `${cfg.url}/front/computer.form.php?id=${l.glpiId}` : null,
    }))
  }, {
    auth: ['lecteur', 'gestionnaire', 'admin', 'svc'],
    response: { 200: t.Array(Machine) },
    detail: { summary: 'Machines rattachées à un incident' },
  })
  .post('/incidents/:id/machines', async ({ params, body, user, status }) => {
    const nom = body.nom.trim()
    if (!nom) return status(400, { message: 'Nom de machine vide.' })

    const [incident] = await db.select({ id: mainSchema.incident.id }).from(mainSchema.incident)
      .where(eq(mainSchema.incident.id, params.id)).limit(1)
    if (!incident) return status(404, { message: 'Incident introuvable.' })

    await db.insert(glpiSchema.incidentMachine)
      .values({ incidentId: params.id, nom, glpiId: body.glpiId ?? null, ajoutePar: user?.id })
      // Rattacher deux fois la même machine ne doit pas échouer : on complète simplement
      // l'identifiant d'inventaire s'il manquait.
      .onConflictDoUpdate({
        target: [glpiSchema.incidentMachine.incidentId, glpiSchema.incidentMachine.nom],
        set: { glpiId: body.glpiId ?? null },
      })

    return { nom }
  }, {
    auth: ['gestionnaire', 'admin'],
    body: t.Object({ nom: t.String({ maxLength: 255 }), glpiId: t.Optional(t.String()) }),
    response: { 200: t.Object({ nom: t.String() }), 400: t.Object({ message: t.String() }), 404: t.Object({ message: t.String() }) },
    detail: { summary: 'Rattacher une machine à un incident' },
  })
  // Incidents d'une machine, désignée par son identifiant d'inventaire.
  //
  // Slowpoke et le registre d'actifs synchronisent LE MÊME inventaire : cet identifiant est donc
  // la clé de jointure, sans qu'aucune application connaisse les identifiants internes de
  // l'autre. Ouverte aux COMPTES DE SERVICE en lecture, sans quoi une clé valable reçoit un 401.
  .get('/machines/:glpiId/incidents', async ({ params, query }) => {
    const lignes = await db.select({ incident: mainSchema.incident })
      .from(glpiSchema.incidentMachine)
      .innerJoin(mainSchema.incident, eq(mainSchema.incident.id, glpiSchema.incidentMachine.incidentId))
      .where(eq(glpiSchema.incidentMachine.glpiId, params.glpiId))
      // Le plus récent d'abord : une fiche d'actif montre d'abord ce qui vient d'arriver.
      .orderBy(desc(mainSchema.incident.createdAt))
      .limit(Math.min(100, Math.max(1, query.limit ?? 20)))

    return lignes.map(l => l.incident)
  }, {
    auth: ['lecteur', 'gestionnaire', 'admin', 'svc'],
    params: t.Object({ glpiId: t.String() }),
    query: t.Object({
      limit: t.Optional(t.Number({ description: 'Nombre maximum d\'incidents (défaut 20, plafond 100)' })),
    }),
    response: { 200: t.Array(_selectIncident) },
    detail: { summary: 'Incidents rattachés à une machine (par identifiant GLPI)' },
  })
  .delete('/incidents/:id/machines/:nom', async ({ params }) => {
    await db.delete(glpiSchema.incidentMachine).where(and(
      eq(glpiSchema.incidentMachine.incidentId, params.id),
      eq(glpiSchema.incidentMachine.nom, decodeURIComponent(params.nom)),
    ))
    return { efface: true }
  }, {
    auth: ['gestionnaire', 'admin'],
    response: { 200: t.Object({ efface: t.Boolean() }) },
    detail: { summary: 'Détacher une machine d\'un incident' },
  })
