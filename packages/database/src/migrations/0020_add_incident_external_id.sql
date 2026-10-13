ALTER TABLE "incident" ADD COLUMN "external_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "incident_external_id_uq" ON "incident" USING btree ("external_id");