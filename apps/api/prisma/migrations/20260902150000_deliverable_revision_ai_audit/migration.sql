-- Correctif audit Codex P2-001 — colonnes additives, nullables : snapshot d'audit minimal
-- (taskType/promptVersionId/modelProvider/modelName/routingDecisionId/contextFingerprint/
-- generatedAt) capturé une seule fois à la création d'une révision AI_GENERATED, jamais mis à jour
-- ensuite — la révision reste auditable même si la ligne Generation source évolue.
ALTER TABLE "deliverable_revisions" ADD COLUMN "ai_task_type" VARCHAR(40);
ALTER TABLE "deliverable_revisions" ADD COLUMN "ai_prompt_version_id" UUID;
ALTER TABLE "deliverable_revisions" ADD COLUMN "ai_model_provider" VARCHAR(40);
ALTER TABLE "deliverable_revisions" ADD COLUMN "ai_model_name" VARCHAR(80);
ALTER TABLE "deliverable_revisions" ADD COLUMN "ai_routing_decision_id" UUID;
ALTER TABLE "deliverable_revisions" ADD COLUMN "ai_context_fingerprint" VARCHAR(64);
ALTER TABLE "deliverable_revisions" ADD COLUMN "ai_generated_at" TIMESTAMP(3);
