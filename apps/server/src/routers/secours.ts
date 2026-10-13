import { Elysia } from "elysia";
import { betterAuth } from "../middleware/auth";
import { db } from "@slowpoke/database";
import { mainSchema } from "@slowpoke/database/tables";

// TRACE D'UNE CONNEXION DE SECOURS : la seule voie non fédérée ne doit pas être aussi la
// seule invisible.
//
// La route exige une session — donc appelable seulement APRÈS une authentification réussie.
// Tous les rôles sont acceptés, `user` compris : on trace la tentative même sans accès applicatif.
export const secoursRouter = new Elysia({ name: 'secours', prefix: '/api/secours', tags: ['Comptes'] })
  .use(betterAuth)
  .post('/trace', async ({ user }) => {
    if (!user) return { traced: false }

    console.warn(`⚠️  Connexion de secours (hors SSO) : ${user.email} — ${new Date().toISOString()}`)

    await db.insert(mainSchema.auditLog).values({
      table_name: 'user',
      row_id: user.id,
      action: 'login_secours',
      actor_user: user.id,
    })

    return { traced: true }
  }, {
    auth: ['user', 'lecteur', 'gestionnaire', 'admin'],
    detail: {
      summary: 'Tracer une connexion de secours',
      description: "Enregistre au journal d'audit qu'une connexion par mot de passe (hors SSO) vient d'aboutir. Appelée par la page /login-secours juste après l'authentification.",
    },
  })
