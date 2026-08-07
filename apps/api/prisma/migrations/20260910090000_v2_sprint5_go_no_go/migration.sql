-- V2 Sprint 5 — GO/NO-GO IA : préqualification d'Opportunity (Niveau 1), rapport GO/NO-GO complet
-- post-analyse DCE (Niveau 2), décision humaine partagée entre les deux niveaux, promotion
-- Opportunity -> Tender. Additif uniquement, aucune ancienne migration modifiée, aucune table/
-- colonne supprimée.

-- 1) Opportunity — racine tenantée du Niveau 1. clientAccountId/buyerId/tenderId nullables :
--    une Opportunity peut exister sans candidat/acheteur/Tender résolus.
CREATE TABLE "opportunities" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "client_account_id" UUID,
    "buyer_id" UUID,
    "title" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "source" VARCHAR(20) NOT NULL DEFAULT 'MANUAL',
    "external_reference" VARCHAR(255),
    "buyer_name" VARCHAR(300),
    "sector" VARCHAR(120),
    "cpv_code" VARCHAR(20),
    "location" VARCHAR(300),
    "geographic_zone" VARCHAR(300),
    "publication_date" TIMESTAMP(3),
    "submission_deadline" TIMESTAMP(3),
    "estimated_amount" DECIMAL(19,4),
    "currency" CHAR(3) DEFAULT 'EUR',
    "procedure_type" VARCHAR(80),
    "status" VARCHAR(20) NOT NULL,
    "tender_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id")
);

-- Catalogue préparé pour de futurs connecteurs (mission §4) — seul MANUAL est produit ce sprint.
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_source_check"
  CHECK ("source" IN ('MANUAL', 'BOAMP', 'TED', 'PRIVATE'));

ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_status_check"
  CHECK ("status" IN ('DRAFT', 'TO_QUALIFY', 'QUALIFIED', 'GO', 'GO_CONDITIONAL', 'NO_GO', 'PROMOTED', 'DISMISSED', 'ARCHIVED'));

-- 2) OpportunityQuickScore — score rapide de préqualification (Niveau 1), append-only : une
--    nouvelle version à chaque recalcul, jamais écrasée.
CREATE TABLE "opportunity_quick_scores" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "opportunity_id" UUID NOT NULL,
    "score_version" INTEGER NOT NULL,
    "global_score" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "complexity" INTEGER NOT NULL,
    "category_scores" JSONB NOT NULL,
    "strengths" JSONB NOT NULL DEFAULT '[]',
    "weaknesses" JSONB NOT NULL DEFAULT '[]',
    "blockers" JSONB NOT NULL DEFAULT '[]',
    "missing_data" JSONB NOT NULL DEFAULT '[]',
    "calculation_version" VARCHAR(20) NOT NULL,
    "data_snapshot" JSONB NOT NULL,
    "requested_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opportunity_quick_scores_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "opportunity_quick_scores" ADD CONSTRAINT "opportunity_quick_scores_complexity_check"
  CHECK ("complexity" BETWEEN 1 AND 5);

ALTER TABLE "opportunity_quick_scores" ADD CONSTRAINT "opportunity_quick_scores_confidence_check"
  CHECK ("confidence" BETWEEN 0 AND 1);

-- 3) GoNoGoReport — rapport GO/NO-GO complet (Niveau 2), append-only. Exige une analyse DCE déjà
--    terminée ; analysisVersion figé au moment du calcul, jamais re-résolu.
CREATE TABLE "go_no_go_reports" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "report_version" INTEGER NOT NULL,
    "analysis_version" INTEGER NOT NULL,
    "global_score" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "complexity" INTEGER NOT NULL,
    "documentary_load" VARCHAR(20) NOT NULL,
    "estimated_prep_time" JSONB NOT NULL,
    "category_scores" JSONB NOT NULL,
    "positive_causes" JSONB NOT NULL DEFAULT '[]',
    "negative_causes" JSONB NOT NULL DEFAULT '[]',
    "risks" JSONB NOT NULL DEFAULT '[]',
    "blockers" JSONB NOT NULL DEFAULT '[]',
    "missing_info" JSONB NOT NULL DEFAULT '[]',
    "subcontracting_flags" JSONB NOT NULL DEFAULT '[]',
    "recommendation" VARCHAR(20) NOT NULL,
    "recommendation_rationale" TEXT NOT NULL,
    "calculation_version" VARCHAR(20) NOT NULL,
    "requested_by_user_id" UUID,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "go_no_go_reports_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "go_no_go_reports" ADD CONSTRAINT "go_no_go_reports_complexity_check"
  CHECK ("complexity" BETWEEN 1 AND 5);

ALTER TABLE "go_no_go_reports" ADD CONSTRAINT "go_no_go_reports_confidence_check"
  CHECK ("confidence" BETWEEN 0 AND 1);

ALTER TABLE "go_no_go_reports" ADD CONSTRAINT "go_no_go_reports_documentary_load_check"
  CHECK ("documentary_load" IN ('LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH'));

-- Recommandation IA — TOUJOURS distincte d'une GoNoGoDecision (mission §17), jamais appliquée
-- automatiquement.
ALTER TABLE "go_no_go_reports" ADD CONSTRAINT "go_no_go_reports_recommendation_check"
  CHECK ("recommendation" IN ('GO', 'GO_CONDITIONAL', 'NO_GO'));

-- 4) GoNoGoDecision — décision humaine (mission §18), partagée entre les deux niveaux via `level`.
--    Append-only : jamais écrasée, une nouvelle décision est toujours une nouvelle ligne.
CREATE TABLE "go_no_go_decisions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "level" VARCHAR(20) NOT NULL,
    "opportunity_id" UUID,
    "tender_id" UUID,
    "linked_quick_score_id" UUID,
    "linked_report_id" UUID,
    "decision" VARCHAR(20) NOT NULL,
    "justification" TEXT,
    "conditions" TEXT,
    "comment" TEXT,
    "actor_id" UUID NOT NULL,
    "decided_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "insert_seq" BIGSERIAL NOT NULL,

    CONSTRAINT "go_no_go_decisions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "go_no_go_decisions" ADD CONSTRAINT "go_no_go_decisions_level_check"
  CHECK ("level" IN ('OPPORTUNITY', 'TENDER'));

ALTER TABLE "go_no_go_decisions" ADD CONSTRAINT "go_no_go_decisions_decision_check"
  CHECK ("decision" IN ('GO', 'GO_CONDITIONAL', 'NO_GO'));

-- Exactement une des deux cibles renseignée, cohérente avec `level` — jamais les deux, jamais
-- aucune.
ALTER TABLE "go_no_go_decisions" ADD CONSTRAINT "go_no_go_decisions_level_target_check"
  CHECK (
    ("level" = 'OPPORTUNITY' AND "opportunity_id" IS NOT NULL AND "tender_id" IS NULL) OR
    ("level" = 'TENDER' AND "tender_id" IS NOT NULL AND "opportunity_id" IS NULL)
  );

-- Justification obligatoire si NO_GO (mission §18 "justification obligatoire pour NO_GO").
ALTER TABLE "go_no_go_decisions" ADD CONSTRAINT "go_no_go_decisions_justification_required_check"
  CHECK ("decision" != 'NO_GO' OR "justification" IS NOT NULL);

-- Conditions obligatoires si GO_CONDITIONAL (mission §18 "conditions obligatoires pour GO_CONDITIONAL").
ALTER TABLE "go_no_go_decisions" ADD CONSTRAINT "go_no_go_decisions_conditions_required_check"
  CHECK ("decision" != 'GO_CONDITIONAL' OR "conditions" IS NOT NULL);

-- 5) Index

CREATE INDEX "opportunities_organization_id_status_idx" ON "opportunities"("organization_id", "status");
CREATE INDEX "opportunities_organization_id_client_account_id_idx" ON "opportunities"("organization_id", "client_account_id");
CREATE INDEX "opportunities_organization_id_submission_deadline_idx" ON "opportunities"("organization_id", "submission_deadline");
CREATE INDEX "opportunities_organization_id_created_at_idx" ON "opportunities"("organization_id", "created_at");
CREATE UNIQUE INDEX "opportunities_id_organization_id_key" ON "opportunities"("id", "organization_id");
-- Une Opportunity au plus par Tender (Postgres traite plusieurs NULL comme non-conflictuels).
CREATE UNIQUE INDEX "opportunities_tender_id_organization_id_key" ON "opportunities"("tender_id", "organization_id");

CREATE INDEX "opportunity_quick_scores_org_opportunity_created_idx" ON "opportunity_quick_scores"("organization_id", "opportunity_id", "created_at");
CREATE UNIQUE INDEX "opportunity_quick_scores_id_organization_id_key" ON "opportunity_quick_scores"("id", "organization_id");
CREATE UNIQUE INDEX "opportunity_quick_scores_org_opportunity_version_key" ON "opportunity_quick_scores"("organization_id", "opportunity_id", "score_version");

CREATE INDEX "go_no_go_reports_organization_id_tender_id_generated_at_idx" ON "go_no_go_reports"("organization_id", "tender_id", "generated_at");
CREATE UNIQUE INDEX "go_no_go_reports_id_organization_id_key" ON "go_no_go_reports"("id", "organization_id");
CREATE UNIQUE INDEX "go_no_go_reports_org_tender_version_key" ON "go_no_go_reports"("organization_id", "tender_id", "report_version");

CREATE INDEX "go_no_go_decisions_org_level_opportunity_insert_seq_idx" ON "go_no_go_decisions"("organization_id", "level", "opportunity_id", "insert_seq");
CREATE INDEX "go_no_go_decisions_org_level_tender_insert_seq_idx" ON "go_no_go_decisions"("organization_id", "level", "tender_id", "insert_seq");

-- 6) FK — AUDIT-007 (composite, jamais seulement organizationId) sauf vers Organization elle-même.
--    Jamais de cascade depuis Opportunity vers ClientAccount/Buyer/Tender (même motif que
--    Tender.clientAccountId : une ressource référencée par une Opportunity ne peut pas disparaître
--    silencieusement sous elle).

ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_client_account_id_organization_id_fkey"
  FOREIGN KEY ("client_account_id", "organization_id") REFERENCES "client_accounts"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_buyer_id_organization_id_fkey"
  FOREIGN KEY ("buyer_id", "organization_id") REFERENCES "buyers"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_tender_id_organization_id_fkey"
  FOREIGN KEY ("tender_id", "organization_id") REFERENCES "tenders"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Cascade depuis les entités enfants (score/rapport/décision) vers leur racine — motif déjà
-- établi (ex. AiSuggestion -> Tender), jamais l'inverse.
ALTER TABLE "opportunity_quick_scores" ADD CONSTRAINT "opportunity_quick_scores_opportunity_id_organization_id_fkey"
  FOREIGN KEY ("opportunity_id", "organization_id") REFERENCES "opportunities"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "go_no_go_reports" ADD CONSTRAINT "go_no_go_reports_tender_id_organization_id_fkey"
  FOREIGN KEY ("tender_id", "organization_id") REFERENCES "tenders"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "go_no_go_decisions" ADD CONSTRAINT "go_no_go_decisions_opportunity_id_organization_id_fkey"
  FOREIGN KEY ("opportunity_id", "organization_id") REFERENCES "opportunities"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "go_no_go_decisions" ADD CONSTRAINT "go_no_go_decisions_tender_id_organization_id_fkey"
  FOREIGN KEY ("tender_id", "organization_id") REFERENCES "tenders"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "go_no_go_decisions" ADD CONSTRAINT "go_no_go_decisions_linked_quick_score_id_organization_id_fkey"
  FOREIGN KEY ("linked_quick_score_id", "organization_id") REFERENCES "opportunity_quick_scores"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "go_no_go_decisions" ADD CONSTRAINT "go_no_go_decisions_linked_report_id_organization_id_fkey"
  FOREIGN KEY ("linked_report_id", "organization_id") REFERENCES "go_no_go_reports"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
