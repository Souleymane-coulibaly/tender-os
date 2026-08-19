-- Checkpoint 2.1-P2.1-FIX-E — Validation + Response Package freshness/invalidation.
-- Additive only: nullable provenance columns, no backfill, no destructive change.

-- FinalApproval: minimal provenance of the business dossier state actually resolved at the moment
-- of human approval (candidate identity, latest succeeded analysis version/DCE revision, and a
-- SHA-256 fingerprint of the tender's technical memo section-revision state).
ALTER TABLE "final_approvals"
  ADD COLUMN "candidate_company_id" UUID,
  ADD COLUMN "analysis_version" INTEGER,
  ADD COLUMN "dce_revision" INTEGER,
  ADD COLUMN "technical_memo_revision_fingerprint" VARCHAR(64);

-- ResponsePackageVersion: candidate identity resolved at the moment this version was built.
ALTER TABLE "response_package_versions"
  ADD COLUMN "candidate_company_id" UUID;
