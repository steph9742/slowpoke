CREATE TABLE "incident_checklist_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" text NOT NULL,
	"playbook_reference" text NOT NULL,
	"cle" text NOT NULL,
	"fait" boolean DEFAULT false NOT NULL,
	"fait_par" text,
	"fait_le" timestamp
);
--> statement-breakpoint
CREATE TABLE "playbook" (
	"reference" text PRIMARY KEY NOT NULL,
	"chemin" text NOT NULL,
	"titre" text NOT NULL,
	"version" text,
	"statut" text,
	"niveaux" text[],
	"corps" text NOT NULL,
	"empreinte" text NOT NULL,
	"date_revision" timestamp,
	"synchronise_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "incident_checklist_item" ADD CONSTRAINT "incident_checklist_item_incident_id_incident_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incident"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_checklist_item" ADD CONSTRAINT "incident_checklist_item_fait_par_user_id_fk" FOREIGN KEY ("fait_par") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "incident_checklist_item_uq" ON "incident_checklist_item" USING btree ("incident_id","playbook_reference","cle");--> statement-breakpoint
CREATE INDEX "incident_checklist_item_incident_idx" ON "incident_checklist_item" USING btree ("incident_id");--> statement-breakpoint
CREATE INDEX "playbook_statut_idx" ON "playbook" USING btree ("statut");