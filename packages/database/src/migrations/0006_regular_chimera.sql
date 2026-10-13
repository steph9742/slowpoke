CREATE TABLE "incident_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incidentId" text NOT NULL,
	"subscriptionId" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "incident_subscriptions" ADD CONSTRAINT "incident_subscriptions_incidentId_incident_id_fk" FOREIGN KEY ("incidentId") REFERENCES "public"."incident"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_subscriptions" ADD CONSTRAINT "incident_subscriptions_subscriptionId_subscriptions_id_fk" FOREIGN KEY ("subscriptionId") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;