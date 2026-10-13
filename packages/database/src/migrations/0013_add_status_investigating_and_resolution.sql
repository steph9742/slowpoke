CREATE TYPE "public"."incident_resolution" AS ENUM('true_positive', 'false_positive', 'benign', 'duplicate');--> statement-breakpoint
ALTER TYPE "public"."incident_status" ADD VALUE 'investigating' BEFORE 'in_progress';--> statement-breakpoint
ALTER TABLE "incident" ADD COLUMN "resolution" "incident_resolution";