-- Une case peut porter plusieurs requêtes : l'étape est identifiée par sa case et sa requête.
UPDATE "incident_enquete_etape" SET "cle" = "cle" || '.' || "requete_id" WHERE position('.' in "cle") = 0;
