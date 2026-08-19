-- Checkpoint 2.1-P2.1-FIX-D — Technical Memo freshness.
-- Additive only: three nullable columns on technical_memo_section_revisions. No destructive
-- change, no backfill (NULL means "generated before this checkpoint, or a section/revision with no
-- real DCE dependency" — read as TechnicalMemoFreshness.UNKNOWN/not-applicable, never fabricated as
-- CURRENT, see computeTechnicalMemoSectionFreshness).
ALTER TABLE "technical_memo_section_revisions" ADD COLUMN "candidate_company_id" UUID;
ALTER TABLE "technical_memo_section_revisions" ADD COLUMN "analysis_version" INTEGER;
ALTER TABLE "technical_memo_section_revisions" ADD COLUMN "dce_revision" INTEGER;
