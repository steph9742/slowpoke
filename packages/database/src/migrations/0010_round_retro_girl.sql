CREATE TYPE "public"."chart_type" AS ENUM('pie', 'bar', 'area');--> statement-breakpoint
CREATE TABLE "custom_chart" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"chart_type" chart_type NOT NULL,
	"sql_query" text NOT NULL,
	"mapping_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"js_transformer" text,
	"creator_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "custom_chart" ADD CONSTRAINT "custom_chart_creator_id_user_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;