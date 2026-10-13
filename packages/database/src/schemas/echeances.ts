import { pgTable, text, timestamp, uuid, boolean, uniqueIndex, index } from "drizzle-orm/pg-core";
import { incident } from "./schema";
import { user } from "./auth-schema";

/**
 * Applicabilité d'un compteur réglementaire, tranchée pour un incident.
 *
 * La grille de classification donne un défaut par niveau, mais laisse des cas à évaluer :
 * NIS2 en P2, le RGPD dès qu'il y a doute sur des données personnelles. Cette table garde
 * la décision et son auteur — ce qui compte autant que la décision elle-même le jour où il
 * faut expliquer pourquoi un délai n'a pas été armé.
 */
export const incidentEcheance = pgTable("incident_echeance", {
    id: uuid("id").primaryKey().defaultRandom(),
    incidentId: text("incident_id").notNull().references(() => incident.id, { onDelete: "cascade" }),
    /** nis2_alerte | nis2_notification | nis2_rapport | rgpd | cert_renater */
    cle: text("cle").notNull(),
    applicable: boolean("applicable").notNull(),
    decidePar: text("decide_par").references(() => user.id, { onDelete: "set null" }),
    decideLe: timestamp("decide_le").defaultNow().notNull(),
    /**
     * L'ACCOMPLISSEMENT, distinct de l'applicabilité.
     *
     * Savoir qu'un compteur est armé ne dit pas ce qui a été déposé. La déclaration se
     * dépose pendant la conduite de l'incident, par la personne qui le conduit : c'est là
     * qu'elle s'enregistre, pas dans un outil de conformité ouvert trois semaines plus tard.
     *
     * `deposeLe` non nul éteint le compte à rebours : un jalon fait n'est plus un jalon qui
     * court.
     */
    deposeLe: timestamp("depose_le"),
    /** La référence rendue par l'autorité — ANSSI, CNIL, CERT. */
    reference: text("reference"),
    deposePar: text("depose_par").references(() => user.id, { onDelete: "set null" }),
}, (table) => [
    uniqueIndex("incident_echeance_uq").on(table.incidentId, table.cle),
    index("incident_echeance_incident_idx").on(table.incidentId),
]);
