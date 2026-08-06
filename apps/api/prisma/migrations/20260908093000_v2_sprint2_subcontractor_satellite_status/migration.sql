-- Correctif audit Codex (V2 Sprint 2, P1) : "conserver l'historique, jamais de suppression
-- physique" appliqué au répertoire sous-traitants — ajoute un statut ACTIVE|ARCHIVED aux
-- satellites references/certifications/insurances, même discipline que les satellites
-- company-profile (VarChar + CHECK, jamais un enum Postgres natif).

ALTER TABLE "subcontractor_references" ADD COLUMN "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "subcontractor_references" ADD CONSTRAINT "subcontractor_references_status_check" CHECK ("status" IN ('ACTIVE', 'ARCHIVED'));

ALTER TABLE "subcontractor_certifications" ADD COLUMN "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "subcontractor_certifications" ADD CONSTRAINT "subcontractor_certifications_status_check" CHECK ("status" IN ('ACTIVE', 'ARCHIVED'));

ALTER TABLE "subcontractor_insurances" ADD COLUMN "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "subcontractor_insurances" ADD CONSTRAINT "subcontractor_insurances_status_check" CHECK ("status" IN ('ACTIVE', 'ARCHIVED'));
