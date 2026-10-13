ALTER TABLE "incident" ADD COLUMN "pilot" text;--> statement-breakpoint
ALTER TABLE "incident" ADD COLUMN "taken_over_at" timestamp;--> statement-breakpoint
ALTER TABLE "incident" ADD COLUMN "taken_over_by" text;--> statement-breakpoint
ALTER TABLE "incident" ADD CONSTRAINT "incident_pilot_user_id_fk" FOREIGN KEY ("pilot") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident" ADD CONSTRAINT "incident_taken_over_by_user_id_fk" FOREIGN KEY ("taken_over_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "incident_pilot_idx" ON "incident" USING btree ("pilot");