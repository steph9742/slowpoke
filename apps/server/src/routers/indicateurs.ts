import { Elysia, t } from 'elysia'
import { betterAuth } from '../middleware/auth'
import { db } from '@slowpoke/database'
import { mainSchema } from '@slowpoke/database/tables'
import { chercherIndicateur, dejaVu } from '../utils/indicateurs'

// CHERCHER UN INDICATEUR — « est-ce que ceci est connu ? » La logique vit dans
// `utils/indicateurs.ts`, où elle se teste contre une base ; ici, la validation et la trace.

export const indicateursRouter = new Elysia({ name: 'indicateurs', prefix: '/api/indicateurs', tags: ['Indicateurs'] })
  .use(betterAuth)
  .get('/', async ({ query, user, service_account, status }) => {
    const valeur = query.valeur.trim()
    if (!valeur) return status(422, { message: 'Saisissez une valeur à chercher.' })
    if (valeur.length > 2048) return status(422, { message: 'Valeur trop longue.' })

    const reponse = await chercherIndicateur(valeur)
    await db.insert(mainSchema.auditLog).values({
      table_name: 'indicateur',
      row_id: reponse.nature,
      action: 'recherche',
      actor_user: user?.id,
      actor_svc: service_account?.id,
      details: {
        valeur,
        incidents: reponse.slowpoke.total,
        exclusions: reponse.listesBlanches.exclusions.length,
        reglesEdr: reponse.listesBlanches.reglesEdr.length,
      },
    })
    return reponse
  }, {
    auth: ['lecteur', 'gestionnaire', 'admin', 'svc'],
    query: t.Object({
      valeur: t.String({ description: 'IP, domaine, URL, empreinte, adresse mail ou identifiant de compte.' }),
    }),
    detail: {
      summary: 'Chercher un indicateur',
      description: "Dit si une valeur est connue : incidents où elle apparaît (archivés compris, signalés), listes blanches qui la couvrent, machine d'inventaire du même nom. Chaque source dit si elle a été interrogée ; une source non interrogée n'est jamais présentée comme « rien trouvé ». Chaque recherche est tracée au journal d'audit. ⚠️ Le bloc des incidents est rendu deux fois : `slowpoke`, et `sniff` sous l'ancien nom de l'application — même contenu, le second étant conservé pour les appelants en place.",
    },
  })
  .get('/incident/:id', async ({ params }) => dejaVu(params.id), {
    auth: ['lecteur', 'gestionnaire', 'admin', 'svc'],
    params: t.Object({ id: t.String() }),
    detail: {
      summary: "Valeurs d'un incident retrouvées dans d'autres",
      description: "Pour chaque IP, compte, empreinte ou machine de l'incident, les autres incidents où la même valeur apparaît. Répond à la question de la clôture : ce compte ou cette IP sont-ils déjà apparus ?",
    },
  })
