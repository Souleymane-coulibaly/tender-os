-- Checkpoint TENDEROS-2.1-P2.2-F4.1-CODEX-AUDIT — fixe le P1 relevé par l'audit : le mode LOT à
-- N≥2 était refusé purement et simplement à la création du wrapper legacy, régression fonctionnelle
-- par rapport à F2.3 qui avait déjà résolu ce cas côté "tender_submissions" via
-- "submission_response_packages". Table enfant ADDITIVE, mirroir exact de ce précédent (mission
-- §9 "réutiliser le SOT existant, jamais un second moteur") — ne touche jamais aux 3 colonnes
-- scalaires F4.1 sur "submission_packages" (mode global/1 lot, un seul dossier).
CREATE TABLE "submission_package_response_packages" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "submission_package_id" UUID NOT NULL,
  "lot_id" UUID NOT NULL,
  "response_package_version_id" UUID NOT NULL,
  "response_package_artifact_id" UUID NOT NULL,
  "artifact_checksum" VARCHAR(64) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "submission_package_response_packages_pkey" PRIMARY KEY ("id")
);

-- Un seul lot requis ne peut jamais produire deux provenances contradictoires sur le même wrapper.
CREATE UNIQUE INDEX "submission_package_response_packages_package_lot_key" ON "submission_package_response_packages"("submission_package_id", "lot_id");

CREATE INDEX "submission_package_response_packages_organization_id_package_id_idx" ON "submission_package_response_packages"("organization_id", "submission_package_id");
CREATE INDEX "submission_package_response_packages_organization_id_response_package_version_id_idx" ON "submission_package_response_packages"("organization_id", "response_package_version_id");

-- FK composite vers "submission_packages"("id", "organization_id") (contrainte unique déjà en
-- place) — cascade sur suppression du parent, jamais de FK vers response_packages/
-- response_package_versions/package_artifacts (provenance dénormalisée en lecture seule, même
-- discipline que les 3 colonnes scalaires F4.1).
ALTER TABLE "submission_package_response_packages" ADD CONSTRAINT "submission_package_response_packages_submission_package_id_organization_id_fkey" FOREIGN KEY ("submission_package_id", "organization_id") REFERENCES "submission_packages"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
