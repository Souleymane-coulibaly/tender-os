-- TenderOS 2.1 — Checkpoint CCV2-E.2 (Acte d'engagement : instantané immuable du candidat)
--
-- POURQUOI (finding CCV2-E/P1-01). `administrative_engagement_acts` est unique par Tender et porte
-- `signatory_name`/`signatory_capacity` saisis par l'utilisateur, SANS aucune trace de l'entreprise
-- candidate pour laquelle ils l'ont été. Après un changement A -> B, l'acte conservait le
-- signataire de A sans le moindre signal, et rien n'empêchait de produire un acte d'engagement —
-- document juridiquement contraignant — au nom de B avec le signataire de A.
--
-- Décision produit arbitrée (CCV2-E.2 §1) : SNAPSHOT_IMMUTABLE + APPLICABILITY_COMPUTED.
-- L'instantané est écrit une fois, JAMAIS réécrit vers le candidat courant ; la péremption est
-- CALCULÉE À LA LECTURE contre `Tender.candidate_company_id`, jamais persistée — un booléen stocké
-- deviendrait faux au changement suivant. Même motif exact que `go_no_go_reports.candidate_company_id`
-- (Checkpoint 2.1-A6.2) et `withGoNoGoCandidateStaleness`.
--
-- Additive et nullable : `NULL` = acte antérieur à ce checkpoint, jamais périmé rétroactivement.

ALTER TABLE "administrative_engagement_acts" ADD COLUMN "candidate_company_id" UUID;

CREATE INDEX "administrative_engagement_acts_organization_id_candidate_idx"
  ON "administrative_engagement_acts" ("organization_id", "candidate_company_id");
