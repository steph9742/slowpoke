import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

/**
 * RÉGLAGES D'APPLICATION — table clé/valeur.
 *
 * Ce qui se règle depuis l'interface plutôt que par variable d'environnement : une
 * intégration se configure et se teste sans accès au serveur ni redéploiement. La forme
 * clé/valeur évite une migration à chaque nouveau réglage.
 *
 * ⚠️ Certaines valeurs sont des SECRETS (jetons d'API). Elles vivent ici en clair, comme
 * les autres secrets applicatifs, mais ne doivent JAMAIS être renvoyées au navigateur :
 * l'API n'en expose qu'un aperçu. Voir `apps/server/src/routers/settings.ts`.
 */
export const appSetting = pgTable("app_setting", {
    key: text("key").primaryKey(),
    value: text("value"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
});
