-- Sprint 8C Phase 2 — mission "intégration package" : une pièce administrative validée peut être
-- incluse dans un package de soumission comme une source de plus (même motif que EXPORT_ARTIFACT/
-- SIGNATURE_ARTIFACT). Migration additive : jamais une ancienne migration modifiée.

-- AlterTable (ADMINISTRATIVE_DOCUMENT est plus long que les valeurs existantes)
ALTER TABLE "package_files" ALTER COLUMN "source_type" TYPE VARCHAR(24);

-- CheckConstraints (catalogue fermé, hand-appended, jamais un enum natif Prisma)
ALTER TABLE "package_files" DROP CONSTRAINT "package_files_source_type_check";
ALTER TABLE "package_files" ADD CONSTRAINT "package_files_source_type_check" CHECK ("source_type" IN ('EXPORT_ARTIFACT','SIGNATURE_ARTIFACT','MANIFEST','ADMINISTRATIVE_DOCUMENT'));
