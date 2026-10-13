ALTER TABLE "incident_subscriptions" DROP CONSTRAINT "incident_subscriptions_subscriptionId_subscriptions_id_fk";
--> statement-breakpoint
ALTER TABLE "incident_subscriptions" ADD COLUMN "userId" text NOT NULL;--> statement-breakpoint
ALTER TABLE "incident_subscriptions" ADD CONSTRAINT "incident_subscriptions_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "incident_subscriptions_incident_user_uq" ON "incident_subscriptions" USING btree ("incidentId","userId");--> statement-breakpoint
ALTER TABLE "incident_subscriptions" DROP COLUMN "subscriptionId";--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_endpoint_unique" UNIQUE("endpoint");