export const ExportTemplateVersionStatus = {
  Draft: "DRAFT",
  Active: "ACTIVE",
  Archived: "ARCHIVED",
} as const;

export type ExportTemplateVersionStatus = (typeof ExportTemplateVersionStatus)[keyof typeof ExportTemplateVersionStatus];

/** Même discipline que `PromptVersionStatus` (Sprint 6) — DRAFT → ACTIVE → ARCHIVED, jamais de
 *  retour arrière (mission "une version active est immuable"). */
export const ALLOWED_EXPORT_TEMPLATE_VERSION_TRANSITIONS: Record<ExportTemplateVersionStatus, readonly ExportTemplateVersionStatus[]> = {
  [ExportTemplateVersionStatus.Draft]: [ExportTemplateVersionStatus.Active],
  [ExportTemplateVersionStatus.Active]: [ExportTemplateVersionStatus.Archived],
  [ExportTemplateVersionStatus.Archived]: [],
};
