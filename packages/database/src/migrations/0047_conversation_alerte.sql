CREATE TABLE "alerte_chat" (
	"id" text PRIMARY KEY NOT NULL,
	"alerte_id" text NOT NULL,
	"role" text NOT NULL,
	"contenu" text NOT NULL,
	"auteur" text,
	"modele" text,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alerte_chat" ADD CONSTRAINT "alerte_chat_alerte_id_alerte_id_fk" FOREIGN KEY ("alerte_id") REFERENCES "public"."alerte"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerte_chat" ADD CONSTRAINT "alerte_chat_auteur_user_id_fk" FOREIGN KEY ("auteur") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alerte_chat_fil_idx" ON "alerte_chat" USING btree ("alerte_id","cree_le");