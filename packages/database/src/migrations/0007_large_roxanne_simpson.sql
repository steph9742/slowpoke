CREATE TYPE "public"."global_notification_types" AS ENUM('incident_updates', 'new_incidents');--> statement-breakpoint
CREATE TABLE "global_push_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" text NOT NULL,
	"notifyOn" "global_notification_types"[] NOT NULL,
	"lastUpdate" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "global_push_preferences" ADD CONSTRAINT "global_push_preferences_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;