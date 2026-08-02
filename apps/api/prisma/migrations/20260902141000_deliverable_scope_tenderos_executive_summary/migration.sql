-- Correctif audit Codex P1-004 — la migration précédente (20260902140000) ne seedait un repli
-- TENDEROS que pour TECHNICAL_MEMO ; EXECUTIVE_SUMMARY est l'autre type structuré (mission §4) et a
-- besoin du même repli système. Migration additive séparée plutôt qu'une modification de la
-- précédente (déjà appliquée — jamais une migration déjà appliquée n'est éditée).
INSERT INTO "deliverable_templates" ("id", "organization_id", "scope_level", "document_type", "name", "note", "created_by", "created_at")
VALUES (
  '00000000-0000-0000-0000-000000070011',
  '00000000-0000-0000-0000-00000005e57e',
  'TENDEROS',
  'EXECUTIVE_SUMMARY',
  'Modèle système TenderOS — Synthèse exécutive',
  'Repli global par défaut, utilisé uniquement quand aucun modèle Tender/Client/Organisation n''est actif. Placeholder minimal, à adapter par chaque organisation.',
  '00000000-0000-0000-0000-00000005e57e',
  now()
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "deliverable_template_versions" ("id", "organization_id", "deliverable_template_id", "version", "status", "created_by", "created_at", "activated_at")
VALUES (
  '00000000-0000-0000-0000-000000070012',
  '00000000-0000-0000-0000-00000005e57e',
  '00000000-0000-0000-0000-000000070011',
  1,
  'ACTIVE',
  '00000000-0000-0000-0000-00000005e57e',
  now(),
  now()
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "deliverable_template_sections" ("id", "organization_id", "deliverable_template_version_id", "code", "title", "order", "heading_level", "requirement")
VALUES (
  '00000000-0000-0000-0000-000000070013',
  '00000000-0000-0000-0000-00000005e57e',
  '00000000-0000-0000-0000-000000070012',
  'CONTENU',
  'Contenu',
  0,
  1,
  'MANDATORY'
)
ON CONFLICT ("id") DO NOTHING;
