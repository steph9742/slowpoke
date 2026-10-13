CREATE TYPE "public"."intrusion_type" AS ENUM('port_scan', 'brute_force', 'vulnerability_exploit', 'other');--> statement-breakpoint
CREATE TYPE "public"."malware_type" AS ENUM('trojan', 'worm', 'spyware', 'adware', 'other');--> statement-breakpoint
CREATE TYPE "public"."phishing_action" AS ENUM('messages_sent', 'contacts_added', 'identity_modified', 'other');--> statement-breakpoint
CREATE TABLE "data_breach_incident" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" text NOT NULL,
	"detected_at" timestamp DEFAULT now() NOT NULL,
	"concerned_user" uuid,
	"data_categories" text[],
	"records_affected" integer,
	"additional_info" jsonb,
	CONSTRAINT "data_breach_incident_records_affected_non_negative_ck" CHECK ("data_breach_incident"."records_affected" is null or "data_breach_incident"."records_affected" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ddos_incident" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" text NOT NULL,
	"duration_minutes" integer,
	"target_ip" text,
	"target_port" integer,
	"peak_bandwidth_mbps" integer,
	"started_at" timestamp,
	"ended_at" timestamp,
	CONSTRAINT "ddos_incident_duration_non_negative_ck" CHECK ("ddos_incident"."duration_minutes" is null or "ddos_incident"."duration_minutes" >= 0),
	CONSTRAINT "ddos_incident_peak_bandwidth_non_negative_ck" CHECK ("ddos_incident"."peak_bandwidth_mbps" is null or "ddos_incident"."peak_bandwidth_mbps" >= 0),
	CONSTRAINT "ddos_incident_target_port_range_ck" CHECK ("ddos_incident"."target_port" is null or ("ddos_incident"."target_port" >= 1 and "ddos_incident"."target_port" <= 65535)),
	CONSTRAINT "ddos_incident_timeline_ck" CHECK ("ddos_incident"."started_at" is null or "ddos_incident"."ended_at" is null or "ddos_incident"."ended_at" >= "ddos_incident"."started_at")
);
--> statement-breakpoint
CREATE TABLE "intrusion_incident" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" text NOT NULL,
	"intrusion_type" "intrusion_type",
	"detected_at" timestamp DEFAULT now() NOT NULL,
	"network_location" text,
	"additional_info" jsonb
);
--> statement-breakpoint
CREATE TABLE "malware_incident" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" text NOT NULL,
	"rnt_cert_id" text,
	"malware_type" "malware_type",
	"detected_at" timestamp DEFAULT now() NOT NULL,
	"concerned_user" uuid,
	"network_location" text,
	"additional_info" jsonb
);
--> statement-breakpoint
CREATE TABLE "ransomware_incident" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" text NOT NULL,
	"rnt_cert_id" text,
	"detected_at" timestamp DEFAULT now() NOT NULL,
	"entrypoint" text,
	"concerned_user" uuid,
	"concerned_entities" text[],
	"network_location" text[],
	"additional_info" jsonb,
	"ransom_amount" integer,
	"ransom_currency" text,
	CONSTRAINT "ransomware_incident_ransom_amount_non_negative_ck" CHECK ("ransomware_incident"."ransom_amount" is null or "ransomware_incident"."ransom_amount" >= 0),
	CONSTRAINT "ransomware_incident_ransom_pair_ck" CHECK (("ransomware_incident"."ransom_amount" is null and "ransomware_incident"."ransom_currency" is null) or ("ransomware_incident"."ransom_amount" is not null and "ransomware_incident"."ransom_currency" is not null)),
	CONSTRAINT "ransomware_incident_ransom_currency_not_blank_ck" CHECK ("ransomware_incident"."ransom_currency" is null or length(trim("ransomware_incident"."ransom_currency")) > 0)
);
--> statement-breakpoint
CREATE TABLE "phishing_connection_action" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_log_id" uuid NOT NULL,
	"action_type" "phishing_action" NOT NULL,
	"amount" integer,
	"additional_info" jsonb DEFAULT '{}'::jsonb,
	CONSTRAINT "phishing_connection_action_amount_non_negative_ck" CHECK ("phishing_connection_action"."amount" is null or "phishing_connection_action"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "phishing_connection_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phishing_id" uuid NOT NULL,
	"activity_start" timestamp DEFAULT now() NOT NULL,
	"activity_end" timestamp,
	"ip_address" text NOT NULL,
	"country_code" text,
	"country_name" text,
	CONSTRAINT "phishing_connection_log_timeline_ck" CHECK ("phishing_connection_log"."activity_end" is null or "phishing_connection_log"."activity_end" >= "phishing_connection_log"."activity_start"),
	CONSTRAINT "phishing_connection_log_ip_not_blank_ck" CHECK (length(trim("phishing_connection_log"."ip_address")) > 0),
	CONSTRAINT "phishing_connection_log_country_code_shape_ck" CHECK ("phishing_connection_log"."country_code" is null or upper("phishing_connection_log"."country_code") ~ '^[A-Z]{2}$')
);
--> statement-breakpoint
CREATE TABLE "phishing_detail" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" text NOT NULL,
	"detected_at" timestamp DEFAULT now() NOT NULL,
	"concerned_user" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "phishing_identity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phishing_id" uuid NOT NULL,
	"identity_name" text NOT NULL,
	"from_display_name" text,
	"from_address" text,
	"reply_display_name" text,
	"reply_address" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "phishing_identity_name_not_blank_ck" CHECK (length(trim("phishing_identity"."identity_name")) > 0),
	CONSTRAINT "phishing_identity_from_address_shape_ck" CHECK ("phishing_identity"."from_address" is null or "phishing_identity"."from_address" ~* '^[^@s]+@[^@s]+.[^@s]+$'),
	CONSTRAINT "phishing_identity_reply_address_shape_ck" CHECK ("phishing_identity"."reply_address" is null or "phishing_identity"."reply_address" ~* '^[^@s]+@[^@s]+.[^@s]+$')
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"table_name" text NOT NULL,
	"row_id" text NOT NULL,
	"action" text NOT NULL,
	"actor_user" text,
	"actor_svc" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "audit_log_table_name_not_blank_ck" CHECK (length(trim("audit_log"."table_name")) > 0),
	CONSTRAINT "audit_log_row_id_not_blank_ck" CHECK (length(trim("audit_log"."row_id")) > 0),
	CONSTRAINT "audit_log_action_not_blank_ck" CHECK (length(trim("audit_log"."action")) > 0)
);
--> statement-breakpoint
CREATE TABLE "incident_artifact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" text NOT NULL,
	"artifact_type" text NOT NULL,
	"name" text NOT NULL,
	"content" text NOT NULL,
	"mime_type" text NOT NULL,
	"uploaded_by_user" text,
	"uploaded_by_svc" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "incident_artifact_name_not_blank_ck" CHECK (length(trim("incident_artifact"."name")) > 0),
	CONSTRAINT "incident_artifact_content_not_blank_ck" CHECK (length(trim("incident_artifact"."content")) > 0),
	CONSTRAINT "incident_artifact_mime_not_blank_ck" CHECK (length(trim("incident_artifact"."mime_type")) > 0)
);
--> statement-breakpoint
CREATE TABLE "incident_extension" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" text NOT NULL,
	"custom_type" text NOT NULL,
	"tags" text[] DEFAULT '{}',
	"custom_fields" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "incident_extension_incident_id_unique" UNIQUE("incident_id"),
	CONSTRAINT "incident_extension_custom_type_not_blank_ck" CHECK (length(trim("incident_extension"."custom_type")) > 0)
);
--> statement-breakpoint
ALTER TABLE "incident" ADD COLUMN "created_by_svc" text;--> statement-breakpoint
ALTER TABLE "incident_log" ADD COLUMN "created_by_svc" text;--> statement-breakpoint
ALTER TABLE "incident_user" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "data_breach_incident" ADD CONSTRAINT "data_breach_incident_incident_id_incident_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incident"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_breach_incident" ADD CONSTRAINT "data_breach_incident_concerned_user_incident_user_id_fk" FOREIGN KEY ("concerned_user") REFERENCES "public"."incident_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ddos_incident" ADD CONSTRAINT "ddos_incident_incident_id_incident_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incident"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intrusion_incident" ADD CONSTRAINT "intrusion_incident_incident_id_incident_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incident"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "malware_incident" ADD CONSTRAINT "malware_incident_incident_id_incident_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incident"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "malware_incident" ADD CONSTRAINT "malware_incident_concerned_user_incident_user_id_fk" FOREIGN KEY ("concerned_user") REFERENCES "public"."incident_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ransomware_incident" ADD CONSTRAINT "ransomware_incident_incident_id_incident_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incident"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ransomware_incident" ADD CONSTRAINT "ransomware_incident_concerned_user_incident_user_id_fk" FOREIGN KEY ("concerned_user") REFERENCES "public"."incident_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phishing_connection_action" ADD CONSTRAINT "phishing_connection_action_connection_log_id_phishing_connection_log_id_fk" FOREIGN KEY ("connection_log_id") REFERENCES "public"."phishing_connection_log"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phishing_connection_log" ADD CONSTRAINT "phishing_connection_log_phishing_id_phishing_detail_id_fk" FOREIGN KEY ("phishing_id") REFERENCES "public"."phishing_detail"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phishing_detail" ADD CONSTRAINT "phishing_detail_incident_id_incident_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incident"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phishing_detail" ADD CONSTRAINT "phishing_detail_concerned_user_incident_user_id_fk" FOREIGN KEY ("concerned_user") REFERENCES "public"."incident_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phishing_identity" ADD CONSTRAINT "phishing_identity_phishing_id_phishing_detail_id_fk" FOREIGN KEY ("phishing_id") REFERENCES "public"."phishing_detail"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_user_id_fk" FOREIGN KEY ("actor_user") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_svc_service_account_id_fk" FOREIGN KEY ("actor_svc") REFERENCES "public"."service_account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_artifact" ADD CONSTRAINT "incident_artifact_incident_id_incident_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incident"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_artifact" ADD CONSTRAINT "incident_artifact_uploaded_by_user_user_id_fk" FOREIGN KEY ("uploaded_by_user") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_artifact" ADD CONSTRAINT "incident_artifact_uploaded_by_svc_service_account_id_fk" FOREIGN KEY ("uploaded_by_svc") REFERENCES "public"."service_account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_extension" ADD CONSTRAINT "incident_extension_incident_id_incident_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incident"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "data_breach_incident_incident_id_uq" ON "data_breach_incident" USING btree ("incident_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ddos_incident_incident_id_uq" ON "ddos_incident" USING btree ("incident_id");--> statement-breakpoint
CREATE UNIQUE INDEX "intrusion_incident_incident_id_uq" ON "intrusion_incident" USING btree ("incident_id");--> statement-breakpoint
CREATE UNIQUE INDEX "malware_incident_incident_id_uq" ON "malware_incident" USING btree ("incident_id");--> statement-breakpoint
CREATE INDEX "malware_incident_concerned_user_idx" ON "malware_incident" USING btree ("concerned_user");--> statement-breakpoint
CREATE UNIQUE INDEX "ransomware_incident_incident_id_uq" ON "ransomware_incident" USING btree ("incident_id");--> statement-breakpoint
CREATE INDEX "ransomware_incident_concerned_user_idx" ON "ransomware_incident" USING btree ("concerned_user");--> statement-breakpoint
CREATE INDEX "phishing_connection_action_log_id_idx" ON "phishing_connection_action" USING btree ("connection_log_id");--> statement-breakpoint
CREATE INDEX "phishing_connection_log_phishing_id_idx" ON "phishing_connection_log" USING btree ("phishing_id");--> statement-breakpoint
CREATE UNIQUE INDEX "phishing_detail_incident_id_uq" ON "phishing_detail" USING btree ("incident_id");--> statement-breakpoint
CREATE INDEX "phishing_detail_concerned_user_idx" ON "phishing_detail" USING btree ("concerned_user");--> statement-breakpoint
CREATE INDEX "phishing_identity_phishing_id_idx" ON "phishing_identity" USING btree ("phishing_id");--> statement-breakpoint
CREATE INDEX "audit_log_table_row_idx" ON "audit_log" USING btree ("table_name","row_id");--> statement-breakpoint
CREATE INDEX "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "incident_artifact_incident_id_idx" ON "incident_artifact" USING btree ("incident_id");--> statement-breakpoint
CREATE INDEX "incident_extension_custom_type_idx" ON "incident_extension" USING btree ("custom_type");--> statement-breakpoint
ALTER TABLE "incident" ADD CONSTRAINT "incident_created_by_svc_service_account_id_fk" FOREIGN KEY ("created_by_svc") REFERENCES "public"."service_account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_log" ADD CONSTRAINT "incident_log_created_by_svc_service_account_id_fk" FOREIGN KEY ("created_by_svc") REFERENCES "public"."service_account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "incident_status_created_at_idx" ON "incident" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "incident_log_incident_id_created_at_idx" ON "incident_log" USING btree ("incident_id","created_at");--> statement-breakpoint
CREATE INDEX "incident_user_incident_id_idx" ON "incident_user" USING btree ("incident_id");--> statement-breakpoint
CREATE UNIQUE INDEX "incident_user_incident_email_uq" ON "incident_user" USING btree ("incident_id","email");--> statement-breakpoint
ALTER TABLE "incident_log" ADD CONSTRAINT "incident_log_message_not_blank_ck" CHECK (length(trim("incident_log"."message")) > 0);--> statement-breakpoint
ALTER TABLE "incident_user" ADD CONSTRAINT "incident_user_full_name_not_blank_ck" CHECK (length(trim("incident_user"."full_name")) > 0);--> statement-breakpoint
ALTER TABLE "incident_user" ADD CONSTRAINT "incident_user_email_shape_ck" CHECK ("incident_user"."email" is null or "incident_user"."email" ~* '^[^@s]+@[^@s]+.[^@s]+$');