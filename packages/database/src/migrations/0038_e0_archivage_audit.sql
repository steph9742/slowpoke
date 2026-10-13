ALTER TYPE "public"."log_type" ADD VALUE 'enquete_etape';--> statement-breakpoint
ALTER TYPE "public"."log_type" ADD VALUE 'collecte';--> statement-breakpoint
ALTER TYPE "public"."log_type" ADD VALUE 'verification';--> statement-breakpoint
ALTER TYPE "public"."log_type" ADD VALUE 'action';--> statement-breakpoint
ALTER TYPE "public"."log_type" ADD VALUE 'archive';--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "details" jsonb;--> statement-breakpoint
ALTER TABLE "incident" ADD COLUMN "archive_le" timestamp;--> statement-breakpoint
ALTER TABLE "incident" ADD COLUMN "archive_par" text;--> statement-breakpoint
ALTER TABLE "incident" ADD COLUMN "motif_archive" text;--> statement-breakpoint
ALTER TABLE "incident_artifact" ADD COLUMN "supprime_le" timestamp;--> statement-breakpoint
ALTER TABLE "incident_artifact" ADD COLUMN "supprime_par" text;--> statement-breakpoint
ALTER TABLE "incident_artifact" ADD COLUMN "motif_suppression" text;--> statement-breakpoint
ALTER TABLE "incident" ADD CONSTRAINT "incident_archive_par_user_id_fk" FOREIGN KEY ("archive_par") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_artifact" ADD CONSTRAINT "incident_artifact_supprime_par_user_id_fk" FOREIGN KEY ("supprime_par") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "incident_archive_le_idx" ON "incident" USING btree ("archive_le");