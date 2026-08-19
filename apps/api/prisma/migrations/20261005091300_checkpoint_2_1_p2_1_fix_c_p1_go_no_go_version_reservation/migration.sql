-- Checkpoint 2.1-P2.1-FIX-C — correctif audit P1-FIXC-001.
-- New additive table only: a reservation ledger for GoNoGoReport.reportVersion, claimed atomically
-- BEFORE the expensive computation, so reportVersion order always reflects reservation (start)
-- order, never completion order. No changes to any existing table.
CREATE TABLE "go_no_go_report_version_reservations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "report_version" INTEGER NOT NULL,
    "reserved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "go_no_go_report_version_reservations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "go_no_go_report_version_reservations_organization_id_tende_key" ON "go_no_go_report_version_reservations"("organization_id", "tender_id", "report_version");

CREATE INDEX "go_no_go_report_version_reservations_organization_id_tende_idx" ON "go_no_go_report_version_reservations"("organization_id", "tender_id");
