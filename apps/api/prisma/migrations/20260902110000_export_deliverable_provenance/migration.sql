-- Correctif audit Codex P1-001 — colonne additive, nullable : provenance explicite d'une section
-- exportée depuis une révision Deliverables (deliverableId/deliverableSectionId/
-- deliverableRevisionId/revisionNumber/validationStatus/selectedBy/selectedAt), figée dans le
-- manifest, jamais reconstruite depuis les logs. Absente pour toute section Sprint 8A qui
-- n'origine pas de Deliverables (comportement inchangé).
ALTER TABLE "export_section_selections" ADD COLUMN "deliverable_provenance" JSONB;
