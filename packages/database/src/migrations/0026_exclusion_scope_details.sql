ALTER TYPE "public"."incident_resolution" ADD VALUE 'legitimate' BEFORE 'duplicate';--> statement-breakpoint
ALTER TABLE "exclusion" ADD COLUMN "tool_other" text;--> statement-breakpoint
ALTER TABLE "exclusion" ADD COLUMN "scope_details" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "exclusion" ADD COLUMN "broad_scope_acknowledged" boolean DEFAULT false NOT NULL;