-- Sprint 21 (hardening) — mission PARTIE F : Generation n'avait aucune colonne "updatedAt",
-- contrairement à AnalysisJob — seul signal disponible pour détecter une génération restée
-- GENERATING au-delà d'un seuil (process crashé avant finalizeGeneration). Rétro-remplie avec
-- created_at pour les lignes existantes (jamais NULL), maintenue ensuite par Prisma (@updatedAt).

ALTER TABLE "generations" ADD COLUMN "updated_at" TIMESTAMP(3);

UPDATE "generations" SET "updated_at" = COALESCE("completed_at", "created_at");

ALTER TABLE "generations" ALTER COLUMN "updated_at" SET NOT NULL;
ALTER TABLE "generations" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
