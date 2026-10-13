CREATE TABLE "alerte_avis" (
	"id" text PRIMARY KEY NOT NULL,
	"alerte_id" text NOT NULL,
	"contenu" jsonb NOT NULL,
	"modele" text NOT NULL,
	"version_prompt" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL,
	"cree_par" text
);
--> statement-breakpoint
ALTER TABLE "alerte_avis" ADD CONSTRAINT "alerte_avis_alerte_id_alerte_id_fk" FOREIGN KEY ("alerte_id") REFERENCES "public"."alerte"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerte_avis" ADD CONSTRAINT "alerte_avis_cree_par_user_id_fk" FOREIGN KEY ("cree_par") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alerte_avis_alerte_idx" ON "alerte_avis" USING btree ("alerte_id","cree_le");