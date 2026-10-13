ALTER TABLE "incident_echeance" ADD COLUMN "depose_le" timestamp;--> statement-breakpoint
ALTER TABLE "incident_echeance" ADD COLUMN "reference" text;--> statement-breakpoint
ALTER TABLE "incident_echeance" ADD COLUMN "depose_par" text;--> statement-breakpoint
ALTER TABLE "incident_echeance" ADD CONSTRAINT "incident_echeance_depose_par_user_id_fk" FOREIGN KEY ("depose_par") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;