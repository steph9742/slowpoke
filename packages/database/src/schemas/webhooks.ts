import { pgTable, text, timestamp, uuid, boolean, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Webhooks sortants : sur événement d'incident, POST le payload vers une URL externe (n8n, etc.).
 * `events` = sous-ensemble des types de log qui déclenchent ce webhook (validé côté appli).
 * `secret` (optionnel) : signe le payload en HMAC-SHA256 (header X-Slowpoke-Signature).
 */
export const webhook = pgTable("webhook", {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    url: text("url").notNull(),
    events: text("events").array().notNull(),
    secret: text("secret"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
    index("webhook_enabled_idx").on(table.enabled),
    check("webhook_name_not_blank_ck", sql`length(trim(${table.name})) > 0`),
    check("webhook_url_shape_ck", sql`${table.url} ~* '^https?://'`),
]);
