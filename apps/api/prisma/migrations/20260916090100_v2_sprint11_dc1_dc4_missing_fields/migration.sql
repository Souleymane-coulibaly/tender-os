-- AlterTable — DC1 rubrique F1 (attestation d'exclusion), vérifiée dans le fichier réel fourni.
ALTER TABLE "administrative_dc1_declarations" ADD COLUMN "exclusion_attestation" BOOLEAN;

-- AlterTable — DC4 rubriques G/H/I (taux de TVA, avance, durée), vérifiées dans le fichier réel fourni.
ALTER TABLE "administrative_subcontractor_declarations" ADD COLUMN "vat_rate" DOUBLE PRECISION;
ALTER TABLE "administrative_subcontractor_declarations" ADD COLUMN "advance_requested" BOOLEAN;
ALTER TABLE "administrative_subcontractor_declarations" ADD COLUMN "duration_months" INTEGER;
