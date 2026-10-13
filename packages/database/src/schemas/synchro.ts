import { pgTable, text, timestamp, boolean, integer } from "drizzle-orm/pg-core";

/**
 * Dernier passage de chaque synchronisation, réussi ou non.
 *
 * Sans cela, une panne est indiscernable d'une situation saine : une liste vide peut vouloir
 * dire « rien à signaler » comme « la dernière lecture a échoué ».
 *
 * `dernierSucces` est conservé même après un échec : ce qui est affiché date de ce moment-là,
 * et c'est cette date qu'il faut montrer à côté d'un résultat.
 */
export const synchroEtat = pgTable("synchro_etat", {
    /** advens | playbooks | glpi | harfanglab */
    cle: text("cle").primaryKey(),
    dernierSucces: timestamp("dernier_succes"),
    dernierEssai: timestamp("dernier_essai"),
    /** Vrai si le dernier essai a abouti. Faux tant que l'échec dure. */
    dernierOk: boolean("dernier_ok").notNull().default(false),
    derniereErreur: text("derniere_erreur"),
    /** Échecs consécutifs. Remis à zéro au premier succès. */
    echecsConsecutifs: integer("echecs_consecutifs").notNull().default(0),
    /** Résumé du dernier passage réussi, propre à chaque connecteur. */
    dernierBilan: text("dernier_bilan"),
});
