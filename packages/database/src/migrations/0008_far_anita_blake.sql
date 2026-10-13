ALTER TABLE "incident_artifact" DROP CONSTRAINT "incident_artifact_content_not_blank_ck";--> statement-breakpoint
ALTER TABLE "incident_subscriptions" ALTER COLUMN "subscriptionId" SET DATA TYPE uuid;