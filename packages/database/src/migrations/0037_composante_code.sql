ALTER TABLE "incident_user" ADD COLUMN "composante_code" text;--> statement-breakpoint
-- REMPLISSAGE RÉTROACTIF.
--
-- Sans lui, la colonne naît vide et les statistiques par composante restent celles qu'on
-- corrige : les incidents déjà saisis sont justement ceux qu'on veut compter.
--
-- L'extraction porte sur le CODE, jamais sur le libellé. Six écritures de la même
-- composante coexistent en base — `cmpi-901`, `cmpa-901`, `cmpg-901`, `PT (cmpi-903)`,
-- `UFR … (cmpi-901)`, et une valeur dont l'encodage est cassé — et les libellés stockés
-- sont périmés (« IUT de Belfort-Montbéliard » pour 912). Seul le code a survécu intact.
UPDATE "incident_user"
SET "composante_code" = substring("composante" FROM '(?i)cmp[iag]-(\d{3})')
WHERE "composante" ~* 'cmp[iag]-\d{3}';--> statement-breakpoint
-- `UFC` désigne l'établissement entier, et n'a pas de code numérique.
UPDATE "incident_user"
SET "composante_code" = 'UFC'
WHERE "composante_code" IS NULL AND "composante" ~ '\mUFC\M';--> statement-breakpoint
-- Un index : « combien d'incidents par composante » devient la question la plus posée.
CREATE INDEX IF NOT EXISTS "incident_user_composante_code_idx" ON "incident_user" ("composante_code");
