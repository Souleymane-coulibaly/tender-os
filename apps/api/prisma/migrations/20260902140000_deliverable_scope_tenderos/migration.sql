-- Correctif audit Codex P1-004 — ajoute le palier de repli global TENDEROS (ressource système,
-- jamais une organisation tenant réelle) à la hiérarchie de résolution des templates/thèmes.
--
-- 1) Élargit les CHECK existants (jamais une migration précédente modifiée) pour accepter la
--    valeur 'TENDEROS' en plus de 'TENDER'/'CLIENT'/'ORGANIZATION'.
ALTER TABLE "deliverable_templates" DROP CONSTRAINT "deliverable_templates_scope_level_check";
ALTER TABLE "deliverable_templates" ADD CONSTRAINT "deliverable_templates_scope_level_check" CHECK ("scope_level" IN ('TENDER','CLIENT','ORGANIZATION','TENDEROS'));

ALTER TABLE "document_themes" DROP CONSTRAINT "document_themes_scope_level_check";
ALTER TABLE "document_themes" ADD CONSTRAINT "document_themes_scope_level_check" CHECK ("scope_level" IN ('TENDER','CLIENT','ORGANIZATION','TENDEROS'));

ALTER TABLE "deliverables" DROP CONSTRAINT "deliverables_template_source_level_check";
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_template_source_level_check" CHECK ("template_source_level" IS NULL OR "template_source_level" IN ('TENDER','CLIENT','ORGANIZATION','TENDEROS'));

ALTER TABLE "deliverables" DROP CONSTRAINT "deliverables_theme_source_level_check";
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_theme_source_level_check" CHECK ("theme_source_level" IS NULL OR "theme_source_level" IN ('TENDER','CLIENT','ORGANIZATION','TENDEROS'));

-- 2) Seed du repli TENDEROS minimal (un placeholder documenté, jamais un contenu métier réel) —
--    `organization_id` = SYSTEM_ORGANIZATION_ID (sentinel applicatif, voir
--    apps/api/src/modules/deliverables/domain/system-organization.ts). Vérifié : aucune contrainte
--    FK de "deliverable_templates"/"document_themes" vers "organizations", cette valeur n'a donc
--    besoin d'aucune ligne "organizations" réelle. Idempotent (ids fixes, ON CONFLICT DO NOTHING)
--    pour rester rejouable sans erreur sur une base où elle aurait déjà été appliquée partiellement.
INSERT INTO "deliverable_templates" ("id", "organization_id", "scope_level", "document_type", "name", "note", "created_by", "created_at")
VALUES (
  '00000000-0000-0000-0000-000000070001',
  '00000000-0000-0000-0000-00000005e57e',
  'TENDEROS',
  'TECHNICAL_MEMO',
  'Modèle système TenderOS — Mémoire technique',
  'Repli global par défaut, utilisé uniquement quand aucun modèle Tender/Client/Organisation n''est actif. Placeholder minimal, à adapter par chaque organisation.',
  '00000000-0000-0000-0000-00000005e57e',
  now()
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "deliverable_template_versions" ("id", "organization_id", "deliverable_template_id", "version", "status", "created_by", "created_at", "activated_at")
VALUES (
  '00000000-0000-0000-0000-000000070002',
  '00000000-0000-0000-0000-00000005e57e',
  '00000000-0000-0000-0000-000000070001',
  1,
  'ACTIVE',
  '00000000-0000-0000-0000-00000005e57e',
  now(),
  now()
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "deliverable_template_sections" ("id", "organization_id", "deliverable_template_version_id", "code", "title", "order", "heading_level", "requirement")
VALUES (
  '00000000-0000-0000-0000-000000070003',
  '00000000-0000-0000-0000-00000005e57e',
  '00000000-0000-0000-0000-000000070002',
  'CONTENU',
  'Contenu',
  0,
  1,
  'MANDATORY'
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "document_themes" ("id", "organization_id", "scope_level", "name", "created_by", "created_at")
VALUES (
  '00000000-0000-0000-0000-000000080001',
  '00000000-0000-0000-0000-00000005e57e',
  'TENDEROS',
  'Thème système TenderOS',
  '00000000-0000-0000-0000-00000005e57e',
  now()
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "document_theme_versions" ("id", "organization_id", "document_theme_id", "version", "status", "accent_color", "created_by", "created_at", "activated_at")
VALUES (
  '00000000-0000-0000-0000-000000080002',
  '00000000-0000-0000-0000-00000005e57e',
  '00000000-0000-0000-0000-000000080001',
  1,
  'ACTIVE',
  '#1A1A1A',
  '00000000-0000-0000-0000-00000005e57e',
  now(),
  now()
)
ON CONFLICT ("id") DO NOTHING;
