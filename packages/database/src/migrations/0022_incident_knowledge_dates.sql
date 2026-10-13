ALTER TABLE "data_breach_incident" ALTER COLUMN "detected_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "data_breach_incident" ALTER COLUMN "detected_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "intrusion_incident" ALTER COLUMN "detected_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "intrusion_incident" ALTER COLUMN "detected_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "malware_incident" ALTER COLUMN "detected_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "malware_incident" ALTER COLUMN "detected_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ransomware_incident" ALTER COLUMN "detected_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "ransomware_incident" ALTER COLUMN "detected_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "phishing_detail" ALTER COLUMN "detected_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "phishing_detail" ALTER COLUMN "detected_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ddos_incident" ADD COLUMN "detected_at" timestamp;--> statement-breakpoint
ALTER TABLE "incident" ADD COLUMN "knowledge_at" timestamp;--> statement-breakpoint
ALTER TABLE "incident" ADD COLUMN "knowledge_estimated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "incident" ADD COLUMN "referred_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "incident_knowledge_at_idx" ON "incident" USING btree ("knowledge_at");--> statement-breakpoint
-- REPRISE DES DONNÉES EXISTANTES.
--
-- Les incidents créés avant ce champ n'ont aucune date de connaissance. La seule
-- approximation disponible est `created_at`. On la retient, mais on la marque
-- explicitement comme estimée : une valeur déduite ne doit jamais être présentée comme
-- un fait établi — c'est précisément le défaut que ce lot corrige.
--
-- `referred_at` reçoit lui aussi `created_at` : la cellule a été saisie au plus tard à la
-- création de la fiche. Sans cette reprise, il vaudrait l'heure d'exécution de la
-- migration, soit une date franchement fausse.
UPDATE "incident"
SET "knowledge_at" = "created_at",
    "knowledge_estimated" = true,
    "referred_at" = "created_at"
WHERE "knowledge_at" IS NULL;
