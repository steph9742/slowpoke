CREATE TYPE "public"."connaissance_portee" AS ENUM('machine', 'regle');--> statement-breakpoint
CREATE TABLE "connaissance_locale" (
	"id" text PRIMARY KEY NOT NULL,
	"portee" "connaissance_portee" NOT NULL,
	"valeur" text NOT NULL,
	"note" text NOT NULL,
	"cree_par" text,
	"cree_le" timestamp DEFAULT now() NOT NULL,
	"maj_le" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "connaissance_locale_note_not_blank_ck" CHECK (length(trim("connaissance_locale"."note")) > 0)
);
--> statement-breakpoint
ALTER TABLE "connaissance_locale" ADD CONSTRAINT "connaissance_locale_cree_par_user_id_fk" FOREIGN KEY ("cree_par") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "connaissance_locale_uq" ON "connaissance_locale" USING btree ("portee","valeur");