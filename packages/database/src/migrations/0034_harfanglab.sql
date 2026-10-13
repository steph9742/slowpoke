CREATE TABLE "harfanglab_rule" (
	"ref" text PRIMARY KEY NOT NULL,
	"libelle" text,
	"criteres" text[],
	"cible" text,
	"active" boolean DEFAULT true NOT NULL,
	"fourni_par_editeur" boolean DEFAULT false NOT NULL,
	"creee_le" timestamp,
	"presente" boolean DEFAULT true NOT NULL,
	"synchronise_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "synchro_etat" (
	"cle" text PRIMARY KEY NOT NULL,
	"dernier_succes" timestamp,
	"dernier_essai" timestamp,
	"dernier_ok" boolean DEFAULT false NOT NULL,
	"derniere_erreur" text,
	"echecs_consecutifs" integer DEFAULT 0 NOT NULL,
	"dernier_bilan" text
);
--> statement-breakpoint
ALTER TABLE "exclusion" ADD COLUMN "outil_ref" text;--> statement-breakpoint
CREATE INDEX "harfanglab_rule_presente_idx" ON "harfanglab_rule" USING btree ("presente","fourni_par_editeur");