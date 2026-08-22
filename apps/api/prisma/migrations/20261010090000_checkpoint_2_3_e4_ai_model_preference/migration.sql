-- Checkpoint TENDEROS-2.1-P2.3-E4 (OpenAI Model Routing V2), mission §13 — table additive
-- uniquement, aucun DROP, aucune modification de table existante, aucun backfill (aucune
-- préférence historique n'existe). Voir schema.prisma pour la justification complète.
CREATE TABLE "ai_model_preferences" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "task_type" VARCHAR(40) NOT NULL,
    "model_override" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_model_preferences_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ai_model_preferences_model_override_check" CHECK ("model_override" IN ('GPT_5_4_MINI', 'GPT_5_4_NANO'))
);

CREATE UNIQUE INDEX "ai_model_preferences_user_id_organization_id_task_type_key"
    ON "ai_model_preferences"("user_id", "organization_id", "task_type");

CREATE INDEX "ai_model_preferences_organization_id_task_type_idx"
    ON "ai_model_preferences"("organization_id", "task_type");
