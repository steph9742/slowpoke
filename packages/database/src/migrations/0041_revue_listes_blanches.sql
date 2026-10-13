CREATE TYPE "public"."revue_regle_etat" AS ENUM('active', 'remplacee', 'levee');--> statement-breakpoint
ALTER TYPE "public"."global_notification_types" ADD VALUE 'revue_listes_blanches';--> statement-breakpoint
CREATE TABLE "revue_regle" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tool" "exclusion_tool" DEFAULT 'harfanglab' NOT NULL,
	"regle_ref" text NOT NULL,
	"libelle" text,
	"motif" text NOT NULL,
	"echeance" timestamp NOT NULL,
	"etat" "revue_regle_etat" DEFAULT 'active' NOT NULL,
	"cree_par" text,
	"cree_le" timestamp DEFAULT now() NOT NULL,
	"remplacee_le" timestamp,
	"remplacee_par_exclusion" uuid,
	"levee_le" timestamp,
	"levee_par" text,
	"motif_levee" text,
	"derniere_alerte_le" timestamp,
	"derniere_alerte_niveau" text,
	CONSTRAINT "revue_regle_motif_not_blank_ck" CHECK (length(trim("revue_regle"."motif")) > 0),
	CONSTRAINT "revue_regle_ref_not_blank_ck" CHECK (length(trim("revue_regle"."regle_ref")) > 0)
);
--> statement-breakpoint
ALTER TABLE "exclusion" ADD COLUMN "derniere_alerte_le" timestamp;--> statement-breakpoint
ALTER TABLE "exclusion" ADD COLUMN "derniere_alerte_niveau" text;--> statement-breakpoint
ALTER TABLE "revue_regle" ADD CONSTRAINT "revue_regle_cree_par_user_id_fk" FOREIGN KEY ("cree_par") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revue_regle" ADD CONSTRAINT "revue_regle_remplacee_par_exclusion_exclusion_id_fk" FOREIGN KEY ("remplacee_par_exclusion") REFERENCES "public"."exclusion"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revue_regle" ADD CONSTRAINT "revue_regle_levee_par_user_id_fk" FOREIGN KEY ("levee_par") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "revue_regle_etat_echeance_idx" ON "revue_regle" USING btree ("etat","echeance");--> statement-breakpoint
CREATE UNIQUE INDEX "revue_regle_ref_active_idx" ON "revue_regle" USING btree ("tool","regle_ref") WHERE "revue_regle"."etat" = 'active';