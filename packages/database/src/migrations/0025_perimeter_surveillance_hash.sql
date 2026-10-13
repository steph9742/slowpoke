CREATE TYPE "public"."incident_perimeter" AS ENUM('composante', 'laboratoire', 'service_central', 'infrastructure', 'etablissement_raccorde', 'inconnu');--> statement-breakpoint
ALTER TYPE "public"."incident_status" ADD VALUE 'surveillance' BEFORE 'resolved';--> statement-breakpoint
ALTER TABLE "incident" ADD COLUMN "perimeter" "incident_perimeter";--> statement-breakpoint
ALTER TABLE "incident" ADD COLUMN "surveillance_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "incident_artifact" ADD COLUMN "hash_sha256" text;