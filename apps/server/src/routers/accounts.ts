import { Elysia, t } from "elysia";
import { betterAuth } from "../middleware/auth";
import { db } from "@slowpoke/database";
import { authSchema } from "@slowpoke/database/tables";
import { eq } from "drizzle-orm";

export const accountsRouter = new Elysia({ name: 'accounts', prefix: '/api/accounts', tags: ['Comptes'] })
  .use(betterAuth)
  .patch('/:userId/role', async ({ params, body, user, status }) => {
    // Anti-lockout : un admin ne peut pas changer son propre rôle
    if (params.userId === user?.id) {
      return status(400, { message: 'Vous ne pouvez pas modifier votre propre rôle.' });
    }
    const [updated] = await db.update(authSchema.user)
      .set({ role: body.role })
      .where(eq(authSchema.user.id, params.userId))
      .returning({ id: authSchema.user.id, role: authSchema.user.role });
    if (!updated) return status(404, { message: 'Utilisateur introuvable.' });
    return updated;
  }, {
    auth: ['admin'],
    params: t.Object({ userId: t.String() }),
    body: t.Object({
      role: t.Union([
        t.Literal('user'),
        t.Literal('lecteur'),
        t.Literal('gestionnaire'),
        t.Literal('admin'),
      ]),
    }),
    detail: {
      summary: 'Changer le rôle applicatif d\'un utilisateur',
      description: 'Attribue user / lecteur / gestionnaire / admin. Réservé aux admins.',
    },
  });
