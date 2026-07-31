-- CreateTable
CREATE TABLE "ai_models" (
    "id" UUID NOT NULL,
    "provider" VARCHAR(30) NOT NULL,
    "model_key" VARCHAR(60) NOT NULL,
    "display_name" VARCHAR(200) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'ENABLED',
    "capabilities_structured_output" BOOLEAN NOT NULL DEFAULT false,
    "capabilities_tool_calling" BOOLEAN NOT NULL DEFAULT false,
    "capabilities_vision" BOOLEAN NOT NULL DEFAULT false,
    "max_context_tokens" INTEGER,
    "enabled_for_benchmark" BOOLEAN NOT NULL DEFAULT false,
    "enabled_for_production" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_model_pricing_snapshots" (
    "id" UUID NOT NULL,
    "ai_model_id" UUID NOT NULL,
    "input_price_per_million_tokens" DECIMAL(12,6) NOT NULL,
    "output_price_per_million_tokens" DECIMAL(12,6) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "effective_to" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_model_pricing_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "benchmark_suites" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "version" INTEGER NOT NULL,
    "prompt_key" VARCHAR(40) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'DRAFT',
    "description" TEXT,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "benchmark_suites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "benchmark_cases" (
    "id" UUID NOT NULL,
    "suite_id" UUID NOT NULL,
    "input_variables" JSONB NOT NULL,
    "expected_output" JSONB NOT NULL,
    "expected_provenance" JSONB,
    "difficulty" VARCHAR(10) NOT NULL,
    "language" VARCHAR(2) NOT NULL,
    "business_category" VARCHAR(20),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "benchmark_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "benchmark_runs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "suite_id" UUID NOT NULL,
    "suite_version" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "repetitions" INTEGER NOT NULL,
    "concurrency_limit" INTEGER NOT NULL,
    "estimated_cost_amount" DECIMAL(14,6) NOT NULL,
    "estimated_cost_currency" VARCHAR(3) NOT NULL,
    "cost_ceiling_amount" DECIMAL(14,6),
    "launched_by_user_id" UUID NOT NULL,
    "launched_at" TIMESTAMP(3) NOT NULL,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "cancel_requested_at" TIMESTAMP(3),
    "cancelled_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "benchmark_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "benchmark_run_models" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "ai_model_id" UUID NOT NULL,
    "pricing_snapshot_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "benchmark_run_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "benchmark_case_results" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "ai_model_id" UUID NOT NULL,
    "pricing_snapshot_id" UUID,
    "repetition_index" INTEGER NOT NULL,
    "provider" VARCHAR(30),
    "model" VARCHAR(60),
    "raw_output" TEXT,
    "input_token_count" INTEGER,
    "output_token_count" INTEGER,
    "total_token_count" INTEGER,
    "duration_ms" INTEGER,
    "actual_cost_amount" DECIMAL(14,6),
    "evaluation_passed" BOOLEAN NOT NULL,
    "evaluation_score" DECIMAL(5,4) NOT NULL,
    "evaluation_details" JSONB NOT NULL DEFAULT '{}',
    "critical_hallucination_flag" BOOLEAN NOT NULL DEFAULT false,
    "invalid_provenance_flag" BOOLEAN NOT NULL DEFAULT false,
    "error_code" VARCHAR(60),
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "benchmark_case_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_recommendations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "prompt_key" VARCHAR(40) NOT NULL,
    "run_id" UUID NOT NULL,
    "primary_ai_model_id" UUID NOT NULL,
    "escalation_ai_model_id" UUID,
    "score" DECIMAL(5,4) NOT NULL,
    "avg_cost_amount" DECIMAL(14,6) NOT NULL,
    "avg_cost_currency" VARCHAR(3) NOT NULL,
    "avg_latency_ms" INTEGER NOT NULL,
    "confidence" DECIMAL(5,4) NOT NULL,
    "reasons" JSONB NOT NULL DEFAULT '[]',
    "limitations" JSONB NOT NULL DEFAULT '[]',
    "status" VARCHAR(10) NOT NULL DEFAULT 'DRAFT',
    "generated_at" TIMESTAMP(3) NOT NULL,
    "decided_by_user_id" UUID,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "model_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routing_policies" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "prompt_key" VARCHAR(40) NOT NULL,
    "version" INTEGER NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'DRAFT',
    "primary_ai_model_id" UUID NOT NULL,
    "escalation_ai_model_id" UUID,
    "confidence_threshold" DECIMAL(5,4),
    "provenance_required" BOOLEAN NOT NULL DEFAULT true,
    "timeout_ms" INTEGER NOT NULL,
    "max_retries" INTEGER NOT NULL,
    "escalation_conditions" JSONB NOT NULL DEFAULT '[]',
    "source_recommendation_id" UUID,
    "author_user_id" UUID NOT NULL,
    "effective_from" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "routing_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_models_status_idx" ON "ai_models"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ai_models_provider_model_key_key" ON "ai_models"("provider", "model_key");

-- CreateIndex
CREATE INDEX "ai_model_pricing_snapshots_ai_model_id_effective_from_idx" ON "ai_model_pricing_snapshots"("ai_model_id", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "benchmark_suites_name_version_key" ON "benchmark_suites"("name", "version");

-- CreateIndex
CREATE INDEX "benchmark_cases_suite_id_idx" ON "benchmark_cases"("suite_id");

-- CreateIndex
CREATE INDEX "benchmark_runs_organization_id_status_idx" ON "benchmark_runs"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "benchmark_run_models_run_id_ai_model_id_key" ON "benchmark_run_models"("run_id", "ai_model_id");

-- CreateIndex
CREATE INDEX "benchmark_case_results_run_id_ai_model_id_idx" ON "benchmark_case_results"("run_id", "ai_model_id");

-- CreateIndex
CREATE INDEX "benchmark_case_results_run_id_case_id_idx" ON "benchmark_case_results"("run_id", "case_id");

-- CreateIndex
CREATE UNIQUE INDEX "benchmark_case_results_run_id_case_id_ai_model_id_repetitio_key" ON "benchmark_case_results"("run_id", "case_id", "ai_model_id", "repetition_index");

-- CreateIndex
CREATE INDEX "model_recommendations_organization_id_prompt_key_idx" ON "model_recommendations"("organization_id", "prompt_key");

-- CreateIndex
CREATE UNIQUE INDEX "routing_policies_organization_id_prompt_key_version_key" ON "routing_policies"("organization_id", "prompt_key", "version");

-- AddForeignKey
ALTER TABLE "ai_model_pricing_snapshots" ADD CONSTRAINT "ai_model_pricing_snapshots_ai_model_id_fkey" FOREIGN KEY ("ai_model_id") REFERENCES "ai_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benchmark_cases" ADD CONSTRAINT "benchmark_cases_suite_id_fkey" FOREIGN KEY ("suite_id") REFERENCES "benchmark_suites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benchmark_runs" ADD CONSTRAINT "benchmark_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benchmark_run_models" ADD CONSTRAINT "benchmark_run_models_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "benchmark_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benchmark_run_models" ADD CONSTRAINT "benchmark_run_models_ai_model_id_fkey" FOREIGN KEY ("ai_model_id") REFERENCES "ai_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benchmark_run_models" ADD CONSTRAINT "benchmark_run_models_pricing_snapshot_id_fkey" FOREIGN KEY ("pricing_snapshot_id") REFERENCES "ai_model_pricing_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benchmark_case_results" ADD CONSTRAINT "benchmark_case_results_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "benchmark_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_recommendations" ADD CONSTRAINT "model_recommendations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routing_policies" ADD CONSTRAINT "routing_policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
