ALTER TYPE "public"."phishing_action" ADD VALUE 'messages_deleted' BEFORE 'contacts_added';--> statement-breakpoint
ALTER TABLE "phishing_connection_action" ADD COLUMN "label" text;