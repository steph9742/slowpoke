DROP INDEX "malware_incident_concerned_user_idx";--> statement-breakpoint
DROP INDEX "ransomware_incident_concerned_user_idx";--> statement-breakpoint
ALTER TABLE "data_breach_incident" ADD COLUMN "exfil_destinations" text[];--> statement-breakpoint
ALTER TABLE "ddos_incident" ADD COLUMN "targets" text[];--> statement-breakpoint
ALTER TABLE "ddos_incident" ADD COLUMN "source_ips" text[];--> statement-breakpoint
ALTER TABLE "ddos_incident" ADD COLUMN "vectors" text[];--> statement-breakpoint
ALTER TABLE "intrusion_incident" ADD COLUMN "source_ips" text[];--> statement-breakpoint
ALTER TABLE "intrusion_incident" ADD COLUMN "compromised_accounts" text[];--> statement-breakpoint
ALTER TABLE "intrusion_incident" ADD COLUMN "machines" text[];--> statement-breakpoint
ALTER TABLE "intrusion_incident" ADD COLUMN "network_locations" text[];--> statement-breakpoint
ALTER TABLE "malware_incident" ADD COLUMN "machines" text[];--> statement-breakpoint
ALTER TABLE "malware_incident" ADD COLUMN "iocs" text[];--> statement-breakpoint
ALTER TABLE "malware_incident" ADD COLUMN "c2" text[];--> statement-breakpoint
ALTER TABLE "malware_incident" ADD COLUMN "network_locations" text[];--> statement-breakpoint
ALTER TABLE "ransomware_incident" ADD COLUMN "machines" text[];--> statement-breakpoint
ALTER TABLE "ransomware_incident" ADD COLUMN "iocs" text[];--> statement-breakpoint
ALTER TABLE "data_breach_incident" DROP COLUMN "concerned_user";--> statement-breakpoint
ALTER TABLE "ddos_incident" DROP COLUMN "target_ip";--> statement-breakpoint
ALTER TABLE "intrusion_incident" DROP COLUMN "network_location";--> statement-breakpoint
ALTER TABLE "malware_incident" DROP COLUMN "concerned_user";--> statement-breakpoint
ALTER TABLE "malware_incident" DROP COLUMN "network_location";--> statement-breakpoint
ALTER TABLE "ransomware_incident" DROP COLUMN "concerned_user";