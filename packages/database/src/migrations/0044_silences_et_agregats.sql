CREATE TYPE "public"."silence_etat" AS ENUM('active', 'levee');--> statement-breakpoint
CREATE TABLE "alerte_agregat" (
	"id" text PRIMARY KEY NOT NULL,
	"mois" text NOT NULL,
	"source" "alerte_source" NOT NULL,
	"regle_id" text NOT NULL,
	"machine" text NOT NULL,
	"statut" "alerte_statut" NOT NULL,
	"motif_ecart" "alerte_motif_ecart",
	"alertes" integer DEFAULT 0 NOT NULL,
	"occurrences" integer DEFAULT 0 NOT NULL,
	"maj_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "silence_alerte" (
	"id" text PRIMARY KEY NOT NULL,
	"source" "alerte_source" DEFAULT 'wazuh' NOT NULL,
	"regle_id" text NOT NULL,
	"machine" text,
	"motif" "alerte_motif_ecart" NOT NULL,
	"note" text,
	"echeance" timestamp NOT NULL,
	"etat" "silence_etat" DEFAULT 'active' NOT NULL,
	"cree_par" text,
	"cree_le" timestamp DEFAULT now() NOT NULL,
	"levee_le" timestamp,
	"levee_par" text,
	"motif_levee" text,
	"derniere_alerte_le" timestamp,
	"derniere_alerte_niveau" text,
	CONSTRAINT "silence_alerte_regle_not_blank_ck" CHECK (length(trim("silence_alerte"."regle_id")) > 0)
);
--> statement-breakpoint
ALTER TABLE "silence_alerte" ADD CONSTRAINT "silence_alerte_cree_par_user_id_fk" FOREIGN KEY ("cree_par") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "silence_alerte" ADD CONSTRAINT "silence_alerte_levee_par_user_id_fk" FOREIGN KEY ("levee_par") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alerte_agregat_uq" ON "alerte_agregat" USING btree ("mois","source","regle_id","machine","statut","motif_ecart");--> statement-breakpoint
CREATE INDEX "alerte_agregat_mois_idx" ON "alerte_agregat" USING btree ("mois");--> statement-breakpoint
CREATE INDEX "silence_alerte_etat_echeance_idx" ON "silence_alerte" USING btree ("etat","echeance");--> statement-breakpoint
CREATE INDEX "silence_alerte_regle_idx" ON "silence_alerte" USING btree ("source","regle_id");