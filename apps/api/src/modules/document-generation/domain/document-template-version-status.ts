/** Même motif qu'`ExportTemplateVersionStatus` — une version ACTIVE est immuable (mission "ne
 *  jamais modifier template.docx en place"), une seule ACTIVE par template à la fois (index
 *  partiel, voir migration). */
export const DocumentTemplateVersionStatus = {
  Draft: "DRAFT",
  Active: "ACTIVE",
  Archived: "ARCHIVED",
} as const;

export type DocumentTemplateVersionStatus = (typeof DocumentTemplateVersionStatus)[keyof typeof DocumentTemplateVersionStatus];

/** DRAFT → ACTIVE → ARCHIVED, jamais de retour arrière — même discipline qu'`ExportTemplateVersion`. */
export const ALLOWED_DOCUMENT_TEMPLATE_VERSION_TRANSITIONS: Record<DocumentTemplateVersionStatus, readonly DocumentTemplateVersionStatus[]> = {
  [DocumentTemplateVersionStatus.Draft]: [DocumentTemplateVersionStatus.Active],
  [DocumentTemplateVersionStatus.Active]: [DocumentTemplateVersionStatus.Archived],
  [DocumentTemplateVersionStatus.Archived]: [],
};
