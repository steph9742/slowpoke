import { Elysia, t } from 'elysia'
import { db } from '@slowpoke/database'
import { mainSchema } from '@slowpoke/database/tables'
import { betterAuth } from '../middleware/auth'
import { archiveDirectory } from '../utils/archive'
import { and, eq, isNull } from 'drizzle-orm'
import { createLog } from '../utils/log'

export const artifactsRouter = new Elysia({ name: 'artifacts', prefix: '/api/artifacts', tags: ['Artéfacts et fichiers'] })
    .use(betterAuth)
    .get('/:incidentId', async ({ params }) => {
      return await db.query.incidentArtifact.findMany({
        where: (artifact, { eq, and, isNull }) => and(eq(artifact.incidentId, params.incidentId), isNull(artifact.supprimeLe)),
      })
    }, {
        auth: ['lecteur', 'gestionnaire', 'admin', 'svc'],
        params: t.Object({
          incidentId: t.String({ description: 'ID de l\'incident' }),
        }),
        detail: {
          summary: 'Obtenir la liste des artéfacts d\'un incident',
          description: 'Récupère la liste des artéfacts et fichiers associés à un incident, avec leurs métadonnées (nom, type, date d\'upload, etc.)'
        }
    })
    .post('/:incidentId/upload', async ({ params, body, user, service_account }) => {
      const fileExtension = body.file.name.split('.').pop()
      const filePath = `./uploads/${params.incidentId}/artifact_${Date.now()}.${fileExtension}`

      // Empreinte calculée AVANT écriture, sur le contenu reçu : elle permet de reconnaître
      // le même fichier d'un incident à l'autre et de le comparer à un IOC sans rouvrir la
      // pièce jointe. Sur le flux déjà en mémoire, le coût est négligeable.
      const octets = new Uint8Array(await body.file.arrayBuffer())
      const hashSha256 = new Bun.CryptoHasher('sha256').update(octets).digest('hex')

      await Bun.write(filePath, octets, { createPath: true })

      await db.insert(mainSchema.incidentArtifact).values({
        incidentId: params.incidentId,
        name: body.name,
        content: body.content,
        artifactType: body.type || 'unknown',
        path: filePath,
        mimeType: body.file.type,
        hashSha256,
        uploadedByUser: user?.id,
        uploadedBySvc: service_account?.id
      })

      return { message: 'File uploaded', hashSha256 }
    }, {
        auth: ['gestionnaire', 'admin', 'svc'],
        params: t.Object({
            incidentId: t.String({ description: 'ID de l\'incident' }),
        }),
        body: t.Object({
          name: t.String({ description: 'Nom de l\'artéfact' }),
          content: t.Optional(t.String({ description: 'Contenu de l\'artéfact' })),
          type: t.Optional(t.String({ description: 'Type de l\'artéfact (fichier de log, image, PDF, etc.)' })),
          file: t.File({ description: 'Fichier à uploader' })
        }),
        afterResponse: async ({ params, user, service_account }) => {
          await createLog(params.incidentId, 'artifact_added', user?.id || service_account?.id)
        },
        detail: {
          summary: 'Uploader un artéfact',
          description: 'Permet d\'uploader un artéfact ou fichier associé à un incident. Le fichier est stocké sur le serveur et ses métadonnées sont enregistrées en base de données.'
        }
    })
    // Placée AVANT `/download/:artifactId` : un chemin statique déclaré après un paramètre
    // dynamique se fait capturer par lui, et « all » serait lu comme un identifiant.
    .get('/download/all/:incidentId', async ({ params, query }) => {
      return (await archiveDirectory(`./uploads/${params.incidentId}`, query.compress)).blob()
    }, {
      afterHandle: async ({ responseValue, status, set, query, params }) => {
        if (responseValue instanceof Blob) {
          status(200)
          set.headers['content-disposition'] = `attachment; filename="artifacts_${params.incidentId}_${Date.now()}.${query.compress ? 'tar.gz' : 'tar'}"` 
        } else {          
          status(404)
          return 'No artifacts found'
        }
      },
      auth: ['lecteur', 'gestionnaire', 'admin', 'svc'],
      params: t.Object({
        incidentId: t.String({ description: 'ID de l\'incident' }),
      }),
      query: t.Object({
        compress: t.Optional(t.Boolean({ description: 'Active la compression de l\'archive avec GZIP' }))
      }),
      detail: {
        summary: 'Télécharger une archive des artéfacts d\'un incident',
        description: 'Permet de télécharger une archive contenant tous les artéfacts et fichiers associés à un incident. L\'archive peut être compressée en GZIP pour réduire sa taille.'
      }
    })
    .get('/download/:artifactId', async ({ params, status, set }) => {
      const artefact = await db.query.incidentArtifact.findFirst({
        where: (artifact, { eq }) => eq(artifact.id, params.artifactId),
        columns: { path: true, name: true, mimeType: true, hashSha256: true, supprimeLe: true },
      })

      if (artefact?.supprimeLe) {
        return status(410, 'Cette pièce a été retirée du dossier.')
      }

      // `exists()` rend une PROMESSE : sans `await`, la garde testait un objet toujours
      // vrai. Un fichier absent la franchissait, et l'échec survenait à la lecture — une
      // erreur serveur là où un 404 était la réponse juste.
      if (!artefact?.path || !(await Bun.file(artefact.path).exists())) {
        return status(404, 'Artifact not found')
      }

      // EMPREINTE REVÉRIFIÉE À CHAQUE LECTURE : calculée à l'envoi, elle ne dit rien du fichier
      // d'aujourd'hui si personne ne la compare. Un fichier modifié sur le disque depuis son dépôt
      // est refusé plutôt que servi.
      if (artefact.hashSha256) {
        const octets = new Uint8Array(await Bun.file(artefact.path).arrayBuffer())
        const actuelle = new Bun.CryptoHasher('sha256').update(octets).digest('hex')
        if (actuelle !== artefact.hashSha256) {
          console.error(`❌ Pièce ${params.artifactId} : empreinte différente de celle du dépôt — téléchargement refusé.`)
          return status(409, "Le fichier ne correspond plus à celui qui a été déposé : téléchargement refusé. Signalez-le à un administrateur.")
        }
      }

      // Le nom et le type voyagent avec le fichier : sans eux, le navigateur enregistre un
      // binaire anonyme. Le client n'a plus à les reconstituer de son côté.
      set.headers['content-type'] = artefact.mimeType || 'application/octet-stream'
      set.headers['content-disposition'] = `attachment; filename="${encodeURIComponent(artefact.name || 'artefact')}"`
      return Bun.file(artefact.path)
    }, {
      auth: ['lecteur', 'gestionnaire', 'admin', 'svc'],
      // Le schéma déclarait un `id` que le chemin ne contient pas : la validation échouait
      // avant d'atteindre le fichier, et aucun téléchargement n'aboutissait.
      params: t.Object({
          artifactId: t.String({ description: 'ID de l\'artéfact' }),
      }),
      detail: {
        summary: 'Télécharger un artéfact',
        description: 'Permet de télécharger un artéfact ou fichier associé à un incident. Le serveur vérifie que le fichier existe avant de le retourner.',
      }
    })
    // RETIRER UNE PIÈCE, SANS L'EFFACER : elle disparaît du dossier et du téléchargement, mais
    // le fichier reste, avec qui l'a retirée et pourquoi — effacer effacerait la preuve qu'elle
    // a existé.
    .delete('/:incidentId/:artifactId', async ({ params, body, user, status }) => {
      const motif = body.motif.trim()
      if (!motif) return status(422, 'Le motif est obligatoire.')

      const [retiree] = await db.update(mainSchema.incidentArtifact)
        .set({ supprimeLe: new Date(), supprimePar: user?.id ?? null, motifSuppression: motif })
        .where(and(
          eq(mainSchema.incidentArtifact.id, params.artifactId),
          eq(mainSchema.incidentArtifact.incidentId, params.incidentId),
          isNull(mainSchema.incidentArtifact.supprimeLe),
        ))
        .returning({ id: mainSchema.incidentArtifact.id })

      if (!retiree) return status(404, 'Pièce introuvable ou déjà retirée')
    }, {
      auth: ['admin'],
      params: t.Object({
        incidentId: t.String({ description: 'ID de l\'incident' }),
        artifactId: t.String({ description: 'ID de l\'artéfact' }),
      }),
      body: t.Object({ motif: t.String({ description: 'Pourquoi la pièce est retirée. Obligatoire.' }) }),
      afterHandle: async ({ params, user }) => {
        await createLog(params.incidentId, 'artifact_removed', user?.id)
      },
      detail: {
        summary: 'Retirer une pièce du dossier',
        description: "Réservé aux administrateurs, avec motif. La pièce disparaît de la liste et ne se télécharge plus, mais le fichier est conservé sur le serveur avec l'auteur, la date et le motif du retrait."
      }
    })