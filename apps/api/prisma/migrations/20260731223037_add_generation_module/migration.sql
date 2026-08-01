-- CreateTable
CREATE TABLE "prompt_templates" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "task_type" VARCHAR(40) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "output_mode" VARCHAR(12) NOT NULL,
    "structured_schema_key" VARCHAR(60),
    "archived_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prompt_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_versions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "prompt_template_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'DRAFT',
    "system_prompt" TEXT NOT NULL,
    "user_prompt_template" TEXT NOT NULL,
    "required_variables" JSONB NOT NULL DEFAULT '[]',
    "author_user_id" UUID NOT NULL,
    "effective_from" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prompt_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "client_account_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "task_type" VARCHAR(40) NOT NULL,
    "target_ref" VARCHAR(200),
    "parent_generation_id" UUID,
    "root_generation_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" VARCHAR(12) NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "prompt_template_id" UUID NOT NULL,
    "prompt_version_id" UUID NOT NULL,
    "prompt_version_number" INTEGER NOT NULL,
    "routing_policy_id" UUID,
    "routing_policy_version" INTEGER,
    "routing_decision_id" UUID NOT NULL,
    "model_provider" VARCHAR(30),
    "model_key" VARCHAR(60),
    "fallback_level" INTEGER NOT NULL DEFAULT 0,
    "generated_content" TEXT,
    "structured_content" JSONB,
    "edited_content" TEXT,
    "edited_structured_content" JSONB,
    "edited_by" UUID,
    "edited_at" TIMESTAMP(3),
    "input_token_count" INTEGER,
    "output_token_count" INTEGER,
    "total_token_count" INTEGER,
    "estimated_cost_amount" DECIMAL(14,6),
    "currency" VARCHAR(3),
    "latency_ms" INTEGER,
    "error_code" VARCHAR(60),
    "error_message" TEXT,
    "created_by" UUID NOT NULL,
    "created_by_role" VARCHAR(30),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "validated_by" UUID,
    "validated_at" TIMESTAMP(3),

    CONSTRAINT "generations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "prompt_templates_id_organization_id_key" ON "prompt_templates"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_templates_organization_id_task_type_key" ON "prompt_templates"("organization_id", "task_type");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_versions_id_organization_id_key" ON "prompt_versions"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_versions_organization_id_prompt_template_id_version_key" ON "prompt_versions"("organization_id", "prompt_template_id", "version");

-- CreateIndex
CREATE INDEX "generations_organization_id_tender_id_task_type_idx" ON "generations"("organization_id", "tender_id", "task_type");

-- CreateIndex
CREATE INDEX "generations_organization_id_client_account_id_idx" ON "generations"("organization_id", "client_account_id");

-- CreateIndex
CREATE INDEX "generations_organization_id_status_idx" ON "generations"("organization_id", "status");

-- CreateIndex
CREATE INDEX "generations_root_generation_id_idx" ON "generations"("root_generation_id");

-- CreateIndex
CREATE UNIQUE INDEX "generations_root_generation_id_version_key" ON "generations"("root_generation_id", "version");

-- AddForeignKey
ALTER TABLE "prompt_templates" ADD CONSTRAINT "prompt_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompt_versions" ADD CONSTRAINT "prompt_versions_prompt_template_id_organization_id_fkey" FOREIGN KEY ("prompt_template_id", "organization_id") REFERENCES "prompt_templates"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generations" ADD CONSTRAINT "generations_client_account_id_organization_id_fkey" FOREIGN KEY ("client_account_id", "organization_id") REFERENCES "client_accounts"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generations" ADD CONSTRAINT "generations_tender_id_organization_id_fkey" FOREIGN KEY ("tender_id", "organization_id") REFERENCES "tenders"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generations" ADD CONSTRAINT "generations_parent_generation_id_fkey" FOREIGN KEY ("parent_generation_id") REFERENCES "generations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generations" ADD CONSTRAINT "generations_prompt_template_id_organization_id_fkey" FOREIGN KEY ("prompt_template_id", "organization_id") REFERENCES "prompt_templates"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generations" ADD CONSTRAINT "generations_prompt_version_id_organization_id_fkey" FOREIGN KEY ("prompt_version_id", "organization_id") REFERENCES "prompt_versions"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECK constraints (même motif que ClientAccount.status/RoutingPolicy.status — jamais une chaîne
-- libre non contrôlée en base, en plus de la validation applicative). Catalogue fermé de 17 types
-- de tâche de génération, partagé par PromptTemplate et Generation (voir generation-task-type.ts).
ALTER TABLE "prompt_templates" ADD CONSTRAINT "prompt_templates_task_type_check" CHECK ("task_type" IN (
  'EXECUTIVE_SUMMARY', 'NEED_UNDERSTANDING', 'CRITERION_RESPONSE', 'METHODOLOGY', 'ORGANIZATION',
  'GOVERNANCE', 'HUMAN_RESOURCES', 'TECHNICAL_RESOURCES', 'PLANNING', 'RISK_MANAGEMENT', 'QUALITY',
  'SECURITY', 'CSR', 'REFERENCES', 'SECTION_SUMMARY', 'REPHRASING', 'CONTENT_IMPROVEMENT'
));
ALTER TABLE "prompt_templates" ADD CONSTRAINT "prompt_templates_output_mode_check" CHECK ("output_mode" IN ('FREE_TEXT', 'STRUCTURED'));
ALTER TABLE "prompt_versions" ADD CONSTRAINT "prompt_versions_status_check" CHECK ("status" IN ('DRAFT', 'ACTIVE', 'ARCHIVED'));
ALTER TABLE "generations" ADD CONSTRAINT "generations_task_type_check" CHECK ("task_type" IN (
  'EXECUTIVE_SUMMARY', 'NEED_UNDERSTANDING', 'CRITERION_RESPONSE', 'METHODOLOGY', 'ORGANIZATION',
  'GOVERNANCE', 'HUMAN_RESOURCES', 'TECHNICAL_RESOURCES', 'PLANNING', 'RISK_MANAGEMENT', 'QUALITY',
  'SECURITY', 'CSR', 'REFERENCES', 'SECTION_SUMMARY', 'REPHRASING', 'CONTENT_IMPROVEMENT'
));
ALTER TABLE "generations" ADD CONSTRAINT "generations_status_check" CHECK ("status" IN ('PENDING', 'GENERATING', 'GENERATED', 'FAILED', 'CANCELLED'));

-- Invariant "au plus une PromptVersion ACTIVE par (organization_id, prompt_template_id)" — non
-- exprimable dans le DSL Prisma (pas d'index partiel natif) : ajouté ici à la main, jamais généré
-- par `prisma migrate dev` — même discipline que RoutingPolicy (voir
-- 20260731124812_p1_audit_fixes/migration.sql, "routing_policies_org_prompt_key_active_key").
-- `activateAtomically` (transaction applicative) reste la première ligne de défense ; cet index est
-- le filet de sécurité de dernier recours si l'invariante était violée par un autre chemin (ex.
-- deux activations concurrentes).
CREATE UNIQUE INDEX "prompt_versions_org_template_active_key" ON "prompt_versions"("organization_id", "prompt_template_id") WHERE "status" = 'ACTIVE';

-- Invariant "au plus une génération EN VOL (PENDING/GENERATING) par (organization_id, tender_id,
-- task_type, target_ref)" — même discipline que ci-dessus. `COALESCE(target_ref, '')` normalise le
-- cas NULL (une tâche sans ancrage métier précis) pour que l'index unique s'applique aussi à ce
-- cas, jamais uniquement aux lignes avec un target_ref renseigné. `reserveForGenerating`/le use
-- case Launch restent la première ligne de défense applicative.
CREATE UNIQUE INDEX "generations_org_tender_tasktype_target_inflight_key" ON "generations"("organization_id", "tender_id", "task_type", COALESCE("target_ref", '')) WHERE "status" IN ('PENDING', 'GENERATING');
