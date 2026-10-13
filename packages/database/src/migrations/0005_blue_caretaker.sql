ALTER TYPE "public"."log_type" ADD VALUE 'created';--> statement-breakpoint
ALTER TYPE "public"."log_type" ADD VALUE 'artifact_added';--> statement-breakpoint
ALTER TYPE "public"."log_type" ADD VALUE 'artifact_removed';--> statement-breakpoint
ALTER TYPE "public"."log_type" ADD VALUE 'user_added';--> statement-breakpoint
ALTER TYPE "public"."log_type" ADD VALUE 'user_removed';--> statement-breakpoint
ALTER TYPE "public"."log_type" ADD VALUE 'extension_updated';--> statement-breakpoint
ALTER TYPE "public"."log_type" ADD VALUE 'closed';--> statement-breakpoint
ALTER TABLE "incident_artifact" ALTER COLUMN "content" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "incident_log" ALTER COLUMN "message" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "incident_artifact" ADD COLUMN "path" text;