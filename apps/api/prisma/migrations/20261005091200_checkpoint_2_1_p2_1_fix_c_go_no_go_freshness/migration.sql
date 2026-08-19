-- Checkpoint 2.1-P2.1-FIX-C — GO/NO-GO freshness.
-- Additive only: one nullable column. No destructive change, no backfill (NULL means
-- "generated before this checkpoint, provenance unknown" — read as GoNoGoFreshness.UNKNOWN,
-- never fabricated as CURRENT, see computeGoNoGoFreshness).
ALTER TABLE "go_no_go_reports" ADD COLUMN "dce_revision" INTEGER;
