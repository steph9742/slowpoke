ALTER TABLE "harfanglab_rule" ADD COLUMN "tags" text[];--> statement-breakpoint
ALTER TABLE "harfanglab_rule" ADD COLUMN "champ_tags" text;--> statement-breakpoint
CREATE UNIQUE INDEX "exclusion_outil_ref_active_idx" ON "exclusion" USING btree ("outil_ref") WHERE "exclusion"."state" = 'active' AND "exclusion"."outil_ref" IS NOT NULL;