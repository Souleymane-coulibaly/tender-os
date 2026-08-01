-- Correctif Sprint 6 (audit Codex, réaudit du routing) — Generation.routingDecisionId devient une
-- VRAIE FK vers routing_decisions, jamais plus un UUID local fabriqué. RoutingDecision.analysisId
-- devient nullable et RoutingDecision.generationId est ajouté : une RoutingDecision sert désormais
-- exactement une cible (Analysis OU Generation), jamais aucune ni les deux.

-- AlterTable
ALTER TABLE "generations" ALTER COLUMN "routing_decision_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "routing_decisions" ADD COLUMN     "generation_id" UUID,
ALTER COLUMN "analysis_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "routing_decisions_organization_id_generation_id_idx" ON "routing_decisions"("organization_id", "generation_id");

-- CreateIndex
CREATE UNIQUE INDEX "routing_decisions_id_organization_id_key" ON "routing_decisions"("id", "organization_id");

-- Base existante avec un faux routingDecisionId (mission §6 "si le faux UUID existe déjà dans des
-- données locales historiques, choisir une stratégie explicite") — stratégie retenue : NULLIFIER
-- toute valeur qui ne correspond à aucune RoutingDecision réelle, AVANT d'ajouter la contrainte de
-- clé étrangère ci-dessous (sinon son ajout échouerait sur ces lignes). Ne supprime AUCUNE ligne
-- Generation, ne touche à aucune autre colonne — seule une référence déjà fictive redevient NULL,
-- son état "correct" avant ce correctif (voir rapport §H : "NULL = aucune RoutingPolicy active").
UPDATE "generations" g
SET "routing_decision_id" = NULL
WHERE g."routing_decision_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "routing_decisions" rd
    WHERE rd."id" = g."routing_decision_id" AND rd."organization_id" = g."organization_id"
  );

-- AddForeignKey
ALTER TABLE "generations" ADD CONSTRAINT "generations_routing_decision_id_organization_id_fkey" FOREIGN KEY ("routing_decision_id", "organization_id") REFERENCES "routing_decisions"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Invariant "une RoutingDecision sert exactement une cible" — non exprimable dans le DSL Prisma
-- (XOR), ajouté ici à la main, jamais généré par `prisma migrate dev` — même discipline que les
-- index uniques partiels déjà présents dans ce projet (voir p1_audit_fixes/migration.sql).
ALTER TABLE "routing_decisions" ADD CONSTRAINT "routing_decisions_analysis_or_generation_check" CHECK (
  ("analysis_id" IS NOT NULL AND "generation_id" IS NULL) OR
  ("analysis_id" IS NULL AND "generation_id" IS NOT NULL)
);
