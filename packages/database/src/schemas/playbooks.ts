import { pgTable, text, timestamp, uuid, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { incident } from "./schema";
import { user } from "./auth-schema";

/**
 * PROCÉDURES DE LA CELLULE — copie locale du dépôt de documentation.
 *
 * Les fiches et checklists vivent dans GitLab, qui reste la source de vérité : on n'édite
 * rien ici. Slowpoke en garde une copie pour trois raisons — l'application reste utilisable
 * quand GitLab ne répond pas, on sait quelle VERSION d'une procédure était affichée le jour
 * d'un incident, et la consultation ne dépend pas du réseau au moment où l'on en a besoin.
 */
export const playbook = pgTable("playbook", {
    // La référence du front-matter : INC-04, INC-09-CL, ANX-D. Stable, lisible, et déjà
    // utilisée dans les renvois entre fiches.
    reference: text("reference").primaryKey(),
    chemin: text("chemin").notNull(),
    titre: text("titre").notNull(),
    version: text("version"),
    statut: text("statut"),
    // `niveau_p` du front-matter : [P1, P2]. Sert à choisir entre deux fiches d'un même
    // type — compte compromis en P3/P4, compte critique en P1/P2.
    niveaux: text("niveaux").array(),
    corps: text("corps").notNull(),
    // Empreinte du corps : évite de réécrire une ligne identique à chaque synchronisation,
    // donc de faire mentir `synchronise_le` sur la date du dernier CHANGEMENT.
    empreinte: text("empreinte").notNull(),
    dateRevision: timestamp("date_revision"),
    synchroniseLe: timestamp("synchronise_le").defaultNow().notNull(),
}, (table) => [
    index("playbook_statut_idx").on(table.statut),
]);

/**
 * Cases cochées d'une checklist, pour un incident donné.
 *
 * L'état appartient à l'incident, pas à la personne : deux analystes qui traitent le même
 * incident voient le même avancement.
 *
 * La clé est l'empreinte du TEXTE de la case, pas son rang : une case insérée au milieu ne
 * décale pas l'état des autres, et une case dont le texte change perd son état — elle ne dit
 * plus la même chose, la cocher à nouveau est un acte.
 */
export const incidentChecklistItem = pgTable("incident_checklist_item", {
    id: uuid("id").primaryKey().defaultRandom(),
    incidentId: text("incident_id").notNull().references(() => incident.id, { onDelete: "cascade" }),
    playbookReference: text("playbook_reference").notNull(),
    cle: text("cle").notNull(),
    fait: boolean("fait").notNull().default(false),
    faitPar: text("fait_par").references(() => user.id, { onDelete: "set null" }),
    faitLe: timestamp("fait_le"),
}, (table) => [
    uniqueIndex("incident_checklist_item_uq").on(table.incidentId, table.playbookReference, table.cle),
    index("incident_checklist_item_incident_idx").on(table.incidentId),
]);
