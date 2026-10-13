CREATE TABLE "service_account" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"scopes" text[] NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "service_key" (
	"id" text PRIMARY KEY NOT NULL,
	"service_account_id" text NOT NULL,
	"key" text NOT NULL,
	"metadata" text,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "service_key" ADD CONSTRAINT "service_key_service_account_id_service_account_id_fk" FOREIGN KEY ("service_account_id") REFERENCES "public"."service_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "service_key_key_idx" ON "service_key" USING btree ("key");