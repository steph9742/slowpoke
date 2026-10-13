ALTER TABLE "phishing_identity" DROP CONSTRAINT "phishing_identity_from_address_shape_ck";--> statement-breakpoint
ALTER TABLE "phishing_identity" DROP CONSTRAINT "phishing_identity_reply_address_shape_ck";--> statement-breakpoint
ALTER TABLE "phishing_connection_log" DROP CONSTRAINT "phishing_connection_log_phishing_id_phishing_detail_id_fk";
--> statement-breakpoint
ALTER TABLE "phishing_detail" DROP CONSTRAINT "phishing_detail_concerned_user_incident_user_id_fk";
--> statement-breakpoint
ALTER TABLE "phishing_identity" DROP CONSTRAINT "phishing_identity_phishing_id_phishing_detail_id_fk";
--> statement-breakpoint
DROP INDEX "phishing_connection_log_phishing_id_idx";--> statement-breakpoint
DROP INDEX "phishing_detail_concerned_user_idx";--> statement-breakpoint
DROP INDEX "phishing_identity_phishing_id_idx";--> statement-breakpoint
ALTER TABLE "phishing_connection_log" ADD COLUMN "concerned_user" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "phishing_identity" ADD COLUMN "concerned_user" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "phishing_connection_log" ADD CONSTRAINT "phishing_connection_log_concerned_user_incident_user_id_fk" FOREIGN KEY ("concerned_user") REFERENCES "public"."incident_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phishing_identity" ADD CONSTRAINT "phishing_identity_concerned_user_incident_user_id_fk" FOREIGN KEY ("concerned_user") REFERENCES "public"."incident_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "phishing_connection_log_concerned_user_idx" ON "phishing_connection_log" USING btree ("concerned_user");--> statement-breakpoint
CREATE INDEX "phishing_identity_concerned_user_idx" ON "phishing_identity" USING btree ("concerned_user");--> statement-breakpoint
ALTER TABLE "phishing_connection_log" DROP COLUMN "phishing_id";--> statement-breakpoint
ALTER TABLE "phishing_detail" DROP COLUMN "concerned_user";--> statement-breakpoint
ALTER TABLE "phishing_identity" DROP COLUMN "phishing_id";