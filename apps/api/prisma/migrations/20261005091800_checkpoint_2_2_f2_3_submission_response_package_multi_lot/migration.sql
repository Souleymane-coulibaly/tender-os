-- Checkpoint TENDEROS-2.1-P2.2-F2.3 — provenance multi-lot ADDITIVE (mission §8/§9/§13) : ne touche
-- jamais aux 3 colonnes scalaires F2 sur "tender_submissions" (mode global, un seul dossier), ajoute
-- une table enfant pour le mode multi-lot (N provenances par Submission, une par lot requis).
CREATE TABLE "submission_response_packages" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "submission_id" UUID NOT NULL,
  "lot_id" UUID NOT NULL,
  "response_package_version_id" UUID NOT NULL,
  "response_package_artifact_id" UUID NOT NULL,
  "artifact_checksum" VARCHAR(64) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "submission_response_packages_pkey" PRIMARY KEY ("id")
);

-- Un seul lot requis ne peut jamais produire deux provenances contradictoires sur la même
-- Submission (mission §20 "no partial provenance"/§60 "no duplicate provenance rows").
CREATE UNIQUE INDEX "submission_response_packages_submission_lot_key" ON "submission_response_packages"("submission_id", "lot_id");

CREATE INDEX "submission_response_packages_organization_id_submission_id_idx" ON "submission_response_packages"("organization_id", "submission_id");
CREATE INDEX "submission_response_packages_organization_id_response_package_version_id_idx" ON "submission_response_packages"("organization_id", "response_package_version_id");

-- FK stricte vers tender_submissions uniquement (même agrégat, cascade sur suppression du parent —
-- TenderSubmission n'est jamais supprimée en pratique, mission §46 "un package déjà soumis ne doit
-- pas disparaître silencieusement"). Jamais de FK vers response_packages/response_package_versions/
-- package_artifacts : provenance dénormalisée en lecture seule, même discipline que les 3 colonnes
-- scalaires F2 (mission §9, aucune FK stricte inter-module).
ALTER TABLE "submission_response_packages" ADD CONSTRAINT "submission_response_packages_submission_id_organization_id_fkey" FOREIGN KEY ("submission_id", "organization_id") REFERENCES "tender_submissions"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
