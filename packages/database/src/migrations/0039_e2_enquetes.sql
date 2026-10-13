CREATE TABLE "enquete_requete" (
	"id" text PRIMARY KEY NOT NULL,
	"chemin" text NOT NULL,
	"titre" text NOT NULL,
	"source" text NOT NULL,
	"parametres" text[] NOT NULL,
	"pourquoi" text,
	"lire_le_resultat" text,
	"commande" text,
	"commit" text,
	"empreinte" text NOT NULL,
	"synchronise_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incident_enquete_etape" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" text NOT NULL,
	"playbook_reference" text NOT NULL,
	"cle" text NOT NULL,
	"requete_id" text NOT NULL,
	"requete_commit" text,
	"source" text NOT NULL,
	"parametres" jsonb,
	"nombre" integer,
	"resultat" jsonb,
	"lance_le" timestamp,
	"lance_par" text,
	"verdict" text,
	"motif" text,
	"verdict_le" timestamp,
	"verdict_par" text
);
--> statement-breakpoint
ALTER TABLE "incident_enquete_etape" ADD CONSTRAINT "incident_enquete_etape_incident_id_incident_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incident"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_enquete_etape" ADD CONSTRAINT "incident_enquete_etape_lance_par_user_id_fk" FOREIGN KEY ("lance_par") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_enquete_etape" ADD CONSTRAINT "incident_enquete_etape_verdict_par_user_id_fk" FOREIGN KEY ("verdict_par") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "incident_enquete_etape_uq" ON "incident_enquete_etape" USING btree ("incident_id","playbook_reference","cle");--> statement-breakpoint
CREATE INDEX "incident_enquete_etape_incident_idx" ON "incident_enquete_etape" USING btree ("incident_id");