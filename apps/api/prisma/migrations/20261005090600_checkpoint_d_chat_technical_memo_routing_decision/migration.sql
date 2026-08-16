-- Consolidation IA — Checkpoint D (traçabilité des décisions de routing, Chat + Mémoire technique)
-- — comble le trou explicitement laissé ouvert par Checkpoint A : Analyse et Génération persistent
-- déjà une RoutingDecision durable, Chat et Mémoire technique se contentaient de résoudre une
-- policy active sans jamais l'auditer. `routing_decisions` sert désormais l'un des 4 pipelines IA,
-- jamais aucun ni plusieurs à la fois (généralisation de l'invariant XOR posé en
-- 20260801103000_generation_real_routing_decision, de 2 à 4 colonnes cible).

-- AlterTable
ALTER TABLE "routing_decisions" ADD COLUMN     "conversation_id" UUID,
ADD COLUMN     "technical_memo_section_id" UUID;

-- CreateIndex
CREATE INDEX "routing_decisions_organization_id_conversation_id_idx" ON "routing_decisions"("organization_id", "conversation_id");

-- CreateIndex
CREATE INDEX "routing_decisions_organization_id_technical_memo_section_i_idx" ON "routing_decisions"("organization_id", "technical_memo_section_id");

-- Remplace l'ancienne contrainte CHECK en XOR (2 colonnes cible) par une contrainte généralisée
-- (4 colonnes cible, exactement une non NULL) — aucune ligne existante n'est affectée : chaque
-- RoutingDecision déjà écrite (Analyse ou Génération) a déjà exactement une des deux premières
-- colonnes renseignée, jamais les deux nouvelles.
ALTER TABLE "routing_decisions" DROP CONSTRAINT "routing_decisions_analysis_or_generation_check";

ALTER TABLE "routing_decisions" ADD CONSTRAINT "routing_decisions_exactly_one_target_check" CHECK (
  (
    (CASE WHEN "analysis_id" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "generation_id" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "conversation_id" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "technical_memo_section_id" IS NOT NULL THEN 1 ELSE 0 END)
  ) = 1
);
