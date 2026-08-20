-- TENDEROS-2.1-P2.2-F2 — RESPONSE PACKAGE → SUBMISSION CONVERGENCE
-- Migration additive : jamais une ancienne migration modifiée.
--
-- `tender_submissions` référençait exclusivement `submission-package` (legacy) — aucune colonne ne
-- permettait de figer QUELLE `ResponsePackageVersion`/`PackageArtifact` (le dossier de réponse V2)
-- avait réellement été soumis. Colonnes additives nullables, jamais une FK stricte inter-module
-- (même discipline que `packageId`/`packageHash` déjà dénormalisés depuis `submission-package` sur
-- ce même modèle) : `NULL` pour toute soumission enregistrée avant ce checkpoint, ou pour un Tender
-- dont le dossier V2 n'était pas résolvable sans ambiguïté au moment du dépôt (ex. plusieurs
-- ResponsePackage par lot — jamais deviné, voir `GetSubmittableResponsePackageVersionUseCase`).
-- Le checksum est dénormalisé pour figer la preuve sans jamais recalculer depuis les sources
-- courantes (mission §33).

-- AlterTable
ALTER TABLE "tender_submissions"
  ADD COLUMN "response_package_version_id" UUID,
  ADD COLUMN "response_package_artifact_id" UUID,
  ADD COLUMN "response_package_artifact_checksum" VARCHAR(64);

-- CreateIndex
CREATE INDEX "tender_submissions_response_package_version_id_idx" ON "tender_submissions"("response_package_version_id");
