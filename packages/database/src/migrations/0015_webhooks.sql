CREATE TABLE "webhook" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"events" text[] NOT NULL,
	"secret" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_name_not_blank_ck" CHECK (length(trim("webhook"."name")) > 0),
	CONSTRAINT "webhook_url_shape_ck" CHECK ("webhook"."url" ~* '^https?://')
);
--> statement-breakpoint
CREATE INDEX "webhook_enabled_idx" ON "webhook" USING btree ("enabled");