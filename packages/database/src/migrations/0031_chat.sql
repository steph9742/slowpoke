CREATE TABLE "incident_chat" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" text NOT NULL,
	"proprietaire" text,
	"role" text NOT NULL,
	"contenu" text NOT NULL,
	"auteur" text,
	"modele" text,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "incident_chat" ADD CONSTRAINT "incident_chat_incident_id_incident_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incident"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_chat" ADD CONSTRAINT "incident_chat_proprietaire_user_id_fk" FOREIGN KEY ("proprietaire") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_chat" ADD CONSTRAINT "incident_chat_auteur_user_id_fk" FOREIGN KEY ("auteur") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "incident_chat_fil_idx" ON "incident_chat" USING btree ("incident_id","proprietaire","cree_le");