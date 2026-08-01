-- Correctif Sprint 6 (réaudit Codex P1 — "le rejet d'une génération est absent") — le rejet est un
-- FAIT porté par ses propres colonnes sur la ligne terminale GENERATED, même motif que
-- validated_by/validated_at : jamais une nouvelle transition de statut, jamais une réécriture
-- rétroactive du contenu généré/édité.

-- AlterTable
ALTER TABLE "generations" ADD COLUMN     "rejected_at" TIMESTAMP(3),
ADD COLUMN     "rejected_by" UUID,
ADD COLUMN     "rejection_reason" VARCHAR(1000);

-- Invariant "validation et rejet sont mutuellement exclusifs" — non exprimable dans le DSL Prisma,
-- ajouté ici à la main (même discipline que les CHECK déjà ajoutés pour routing_decisions/
-- prompt_versions dans ce projet) : jamais les deux faits vrais en même temps sur la même ligne.
ALTER TABLE "generations" ADD CONSTRAINT "generations_validated_or_rejected_check" CHECK (
  NOT ("validated_at" IS NOT NULL AND "rejected_at" IS NOT NULL)
);
