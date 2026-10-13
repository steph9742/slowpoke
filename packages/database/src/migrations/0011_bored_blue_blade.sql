ALTER TABLE "incident_user" DROP CONSTRAINT "incident_user_email_shape_ck";--> statement-breakpoint
ALTER TABLE "data_breach_incident" DROP CONSTRAINT "data_breach_incident_concerned_user_incident_user_id_fk";
--> statement-breakpoint
ALTER TABLE "malware_incident" DROP CONSTRAINT "malware_incident_concerned_user_incident_user_id_fk";
--> statement-breakpoint
ALTER TABLE "ransomware_incident" DROP CONSTRAINT "ransomware_incident_concerned_user_incident_user_id_fk";
--> statement-breakpoint
ALTER TABLE "custom_chart" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "custom_chart" ADD COLUMN "grid_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "custom_chart" ADD COLUMN "col_span" integer DEFAULT 1 NOT NULL;