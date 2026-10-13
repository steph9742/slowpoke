import { Elysia, t } from "elysia";
import { db } from "@slowpoke/database";
import { betterAuth } from "../middleware/auth";
import { chartsSchema } from "@slowpoke/database/tables";
import { eq } from "drizzle-orm";

export const chartsRouter = new Elysia({ name: "charts", prefix: "/api/charts", tags: ["Statistiques"] })
  .use(betterAuth)
  .post("/", async ({ body, user }) => {
    const [newChart] = await db.insert(chartsSchema.customChart).values({
      ...body,
      creatorId: user.id
    }).returning();
    return newChart;
  }, {
    auth: ['admin'],
    body: t.Object({
      title: t.String({ description: "Titre du graphique" }),
      description: t.Optional(t.String({ description: "Description du graphique" })),
      chartType: t.Union([t.Literal("pie"), t.Literal("bar"), t.Literal("area")], { description: "Type de graphique (camembert, diagramme à barres, zone chronologique)" }),
      sqlQuery: t.String({ description: "Requête SQL à effectuer pour obtenir les données" }),
      mappingConfig: t.Any({ description: "Configuration du graphique, afin d'assigner les données à une couleur ou une catégorie" }),
      jsTransformer: t.Optional(t.String({ description: "Fonction JavaScript pour traiter les données côté client" }))
    }),
    detail: {
      summary: "Créer un nouveau graphique",
      description: "Permet de créer un graphique personnalisé en fournissant une requête SQL et une configuration de mapping.",

    }
  })
  .get("/", async () => {
    return await db.select().from(chartsSchema.customChart).orderBy(chartsSchema.customChart.createdAt);
  }, {
    auth: ['admin'],
    detail: {
      summary: "Obtenir la liste des graphiques",
      description: "Récupère la liste de tous les graphiques personnalisés créés, avec leurs configurations et métadonnées."
    }
  })
  .delete("/:id", async ({ params }) => {
    const [deleted] = await db.delete(chartsSchema.customChart).where(eq(chartsSchema.customChart.id, params.id)).returning();
    return deleted;
  }, {
    auth: ['admin'],
    params: t.Object({
      id: t.String({ description: "Identifiant du graphique à supprimer" })
    }),
    detail: {
      summary: "Supprimer un graphique",
      description: "Permet de supprimer un graphique personnalisé en spécifiant son identifiant."
    }
  })
  .put("/layout", async ({ body }) => {
    return await db.transaction(async (tx) => {
      const updates = body.map(async (item) => {
        return await tx.update(chartsSchema.customChart)
          .set({
            isActive: item.isActive,
            gridOrder: item.gridOrder,
            colSpan: item.colSpan
          })
          .where(eq(chartsSchema.customChart.id, item.id));
      });
      await Promise.all(updates);
      return { success: true };
    });
  }, {
    auth: ['admin'],
    body: t.Array(t.Object({
      id: t.String({ description: "ID du graphique" }),
      isActive: t.Boolean({ description: "État activé ou désactivé" }),
      gridOrder: t.Number({ description: "Ordre dans la grille" }),
      colSpan: t.Number({ description: "Nombre de colonnes occupées (1 à 4)" })
    })),
    detail: {
      summary: "Mettre à jour la disposition",
      description: "Mettre à jour la disposition des widgets dans le tableau de bord (ordre, taille, affichage)."
    }
  });