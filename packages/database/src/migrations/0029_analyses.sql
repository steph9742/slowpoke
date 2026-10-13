CREATE TABLE "incident_analysis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" text NOT NULL,
	"genre" text NOT NULL,
	"contenu" jsonb NOT NULL,
	"modele" text NOT NULL,
	"version_prompt" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL,
	"cree_par" text
);
--> statement-breakpoint
ALTER TABLE "incident_analysis" ADD CONSTRAINT "incident_analysis_incident_id_incident_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incident"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_analysis" ADD CONSTRAINT "incident_analysis_cree_par_user_id_fk" FOREIGN KEY ("cree_par") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "incident_analysis_incident_genre_idx" ON "incident_analysis" USING btree ("incident_id","genre","cree_le");