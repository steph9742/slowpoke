CREATE TYPE "public"."alerte_motif_ecart" AS ENUM('faux_positif', 'benin', 'bruit_connu', 'doublon', 'hors_perimetre');--> statement-breakpoint
CREATE TYPE "public"."alerte_source" AS ENUM('wazuh', 'n8n', 'manuel');--> statement-breakpoint
CREATE TYPE "public"."alerte_statut" AS ENUM('nouvelle', 'en_cours', 'ecartee', 'escaladee');--> statement-breakpoint
CREATE TABLE "alerte" (
	"id" text PRIMARY KEY NOT NULL,
	"panier" text NOT NULL,
	"source" "alerte_source" DEFAULT 'wazuh' NOT NULL,
	"regle_id" text NOT NULL,
	"regle_libelle" text NOT NULL,
	"niveau" integer NOT NULL,
	"machine" text NOT NULL,
	"ips_source" text[] DEFAULT '{}'::text[] NOT NULL,
	"compte" text,
	"mitre" text[] DEFAULT '{}'::text[] NOT NULL,
	"premiere_vue" timestamp NOT NULL,
	"derniere_vue" timestamp NOT NULL,
	"occurrences" integer DEFAULT 1 NOT NULL,
	"statut" "alerte_statut" DEFAULT 'nouvelle' NOT NULL,
	"motif_ecart" "alerte_motif_ecart",
	"note_ecart" text,
	"silence_id" text,
	"incident_id" text,
	"assigne_a" text,
	"url_tableau_de_bord" text,
	"log_brut" text,
	"contexte" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"creee_le" timestamp DEFAULT now() NOT NULL,
	"maj_le" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "alerte_niveau_ck" CHECK ("alerte"."niveau" >= 0 AND "alerte"."niveau" <= 16),
	CONSTRAINT "alerte_occurrences_ck" CHECK ("alerte"."occurrences" >= 1),
	CONSTRAINT "alerte_motif_si_ecartee_ck" CHECK ("alerte"."statut" <> 'ecartee' OR "alerte"."motif_ecart" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "alerte_journal" (
	"id" text PRIMARY KEY NOT NULL,
	"alerte_id" text NOT NULL,
	"genre" text NOT NULL,
	"message" text NOT NULL,
	"par_utilisateur" text,
	"par_service" text,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alerte" ADD CONSTRAINT "alerte_incident_id_incident_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incident"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerte" ADD CONSTRAINT "alerte_assigne_a_user_id_fk" FOREIGN KEY ("assigne_a") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerte_journal" ADD CONSTRAINT "alerte_journal_alerte_id_alerte_id_fk" FOREIGN KEY ("alerte_id") REFERENCES "public"."alerte"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerte_journal" ADD CONSTRAINT "alerte_journal_par_utilisateur_user_id_fk" FOREIGN KEY ("par_utilisateur") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alerte_panier_uq" ON "alerte" USING btree ("panier");--> statement-breakpoint
CREATE INDEX "alerte_statut_derniere_vue_idx" ON "alerte" USING btree ("statut","derniere_vue");--> statement-breakpoint
CREATE INDEX "alerte_machine_idx" ON "alerte" USING btree ("machine");--> statement-breakpoint
CREATE INDEX "alerte_regle_idx" ON "alerte" USING btree ("regle_id");--> statement-breakpoint
CREATE INDEX "alerte_incident_idx" ON "alerte" USING btree ("incident_id");--> statement-breakpoint
CREATE INDEX "alerte_journal_alerte_idx" ON "alerte_journal" USING btree ("alerte_id","cree_le");