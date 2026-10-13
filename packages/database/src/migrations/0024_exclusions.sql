CREATE TYPE "public"."exclusion_state" AS ENUM('active', 'revoquee');--> statement-breakpoint
CREATE TYPE "public"."exclusion_tool" AS ENUM('harfanglab', 'wazuh', 'pare_feu', 'autre');--> statement-breakpoint
CREATE TABLE "exclusion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" text NOT NULL,
	"tool" "exclusion_tool" NOT NULL,
	"scope" text NOT NULL,
	"reason" text NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"review_date" timestamp NOT NULL,
	"state" "exclusion_state" DEFAULT 'active' NOT NULL,
	"revoked_at" timestamp,
	"revoked_by" text,
	CONSTRAINT "exclusion_scope_not_blank_ck" CHECK (length(trim("exclusion"."scope")) > 0),
	CONSTRAINT "exclusion_reason_not_blank_ck" CHECK (length(trim("exclusion"."reason")) > 0)
);
--> statement-breakpoint
ALTER TABLE "exclusion" ADD CONSTRAINT "exclusion_incident_id_incident_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incident"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exclusion" ADD CONSTRAINT "exclusion_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exclusion" ADD CONSTRAINT "exclusion_revoked_by_user_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exclusion_incident_id_idx" ON "exclusion" USING btree ("incident_id");--> statement-breakpoint
CREATE INDEX "exclusion_state_review_date_idx" ON "exclusion" USING btree ("state","review_date");