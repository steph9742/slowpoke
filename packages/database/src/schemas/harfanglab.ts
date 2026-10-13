import { pgTable, text, timestamp, boolean, index } from "drizzle-orm/pg-core";

/**
 * Copie locale des règles de liste blanche de l'EDR : elle sert à RAPPROCHER, pas à
 * remplacer. `exclusion` reste la décision de la cellule, avec son motif et sa date de revue ;
 * ici on note ce qui existe réellement dans l'outil, pour rendre l'écart visible.
 *
 * Lecture seule côté EDR : Slowpoke n'y écrit jamais.
 */
export const harfanglabRule = pgTable("harfanglab_rule", {
    /** Identifiant de la règle dans l'EDR. */
    ref: text("ref").primaryKey(),
    /** Le commentaire de la règle : c'est ce qui en tient lieu de libellé. */
    libelle: text("libelle"),
    /** Critères, tels que l'EDR les rend. */
    criteres: text("criteres").array(),
    /** all, ioc, ransom, sigma… — ce que la règle neutralise. */
    cible: text("cible"),
    active: boolean("active").notNull().default(true),
    /** Règle fournie par l'éditeur : la signaler comme « non enregistrée » noierait l'écart réel
     *  sous des centaines de lignes qui ne relèvent d'aucune décision locale. */
    fourniParEditeur: boolean("fourni_par_editeur").notNull().default(false),
    creeeLe: timestamp("creee_le"),
    /**
     * Étiquettes de la règle, telles que l'EDR les rend — aucune interprétation ici.
     * Le classement « technique » se déclare dans le registre des listes blanches, où la
     * cellule peut le corriger sans toucher au code : deux endroits qui interpréteraient
     * la même étiquette finiraient par diverger.
     */
    tags: text("tags").array(),
    /**
     * Dans quel champ de l'API les étiquettes ont été trouvées.
     *
     * Le swagger HarfangLab ne documente aucun champ de tag sur `WhitelistRule` : plutôt
     * que de supposer lequel porte le marqueur, on relève celui qui a répondu. `null`
     * signifie qu'aucun n'existe — et c'est cette valeur qui l'apprendra pour de bon.
     */
    champTags: text("champ_tags"),
    /** Faux quand la règle n'est plus revenue : une exclusion enregistrée peut la citer. */
    presente: boolean("presente").notNull().default(true),
    synchroniseLe: timestamp("synchronise_le").defaultNow().notNull(),
}, (table) => [
    index("harfanglab_rule_presente_idx").on(table.presente, table.fourniParEditeur),
]);
