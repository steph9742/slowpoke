ALTER TABLE "ddos_incident" DROP CONSTRAINT "ddos_incident_target_port_range_ck";--> statement-breakpoint
ALTER TABLE "ddos_incident" ADD COLUMN "target_ports" text[];--> statement-breakpoint
ALTER TABLE "ddos_incident" DROP COLUMN "target_port";