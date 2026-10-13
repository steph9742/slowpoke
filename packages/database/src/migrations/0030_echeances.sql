CREATE TABLE "incident_echeance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" text NOT NULL,
	"cle" text NOT NULL,
	"applicable" boolean NOT NULL,
	"decide_par" text,
	"decide_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "incident_echeance" ADD CONSTRAINT "incident_echeance_incident_id_incident_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incident"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_echeance" ADD CONSTRAINT "incident_echeance_decide_par_user_id_fk" FOREIGN KEY ("decide_par") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "incident_echeance_uq" ON "incident_echeance" USING btree ("incident_id","cle");--> statement-breakpoint
CREATE INDEX "incident_echeance_incident_idx" ON "incident_echeance" USING btree ("incident_id");