CREATE TABLE "glpi_machine" (
	"glpi_id" text PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"entite" text,
	"entite_complet" text,
	"lieu" text,
	"lieu_complet" text,
	"groupe" text,
	"groupe_complet" text,
	"type" text,
	"os" text,
	"critique" boolean DEFAULT false NOT NULL,
	"presente" boolean DEFAULT true NOT NULL,
	"synchronise_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incident_machine" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" text NOT NULL,
	"nom" text NOT NULL,
	"glpi_id" text,
	"ajoute_par" text,
	"ajoute_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "incident_machine" ADD CONSTRAINT "incident_machine_incident_id_incident_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incident"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_machine" ADD CONSTRAINT "incident_machine_ajoute_par_user_id_fk" FOREIGN KEY ("ajoute_par") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "glpi_machine_nom_idx" ON "glpi_machine" USING btree ("nom");--> statement-breakpoint
CREATE INDEX "glpi_machine_critique_idx" ON "glpi_machine" USING btree ("critique");--> statement-breakpoint
CREATE UNIQUE INDEX "incident_machine_uq" ON "incident_machine" USING btree ("incident_id","nom");--> statement-breakpoint
CREATE INDEX "incident_machine_incident_idx" ON "incident_machine" USING btree ("incident_id");--> statement-breakpoint
CREATE INDEX "incident_machine_glpi_idx" ON "incident_machine" USING btree ("glpi_id");