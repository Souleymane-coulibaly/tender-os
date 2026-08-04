export type DeliverableSectionSummary = {
  id: string;
  deliverableId: string;
  code: string;
  title: string;
  order: number;
  headingLevel: 1 | 2 | 3;
  mandatory: boolean;
  hidden: boolean;
  locked: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type DeliverableSummary = {
  id: string;
  organizationId: string;
  clientAccountId: string;
  tenderId: string;
  type: string;
  status: string;
  templateVersionId?: string;
  templateSourceLevel?: string;
  themeVersionId?: string;
  themeSourceLevel?: string;
  themeSelectedBy?: string;
  themeSelectedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  sections?: DeliverableSectionSummary[];
};

export type RichTextRun = { text: string; bold?: boolean | undefined; italic?: boolean | undefined; href?: string | undefined };

export type RenderableBlock =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "paragraph"; text: string; runs?: RichTextRun[] | undefined }
  | { kind: "list"; items: string[]; ordered: boolean; itemRuns?: RichTextRun[][] | undefined }
  | { kind: "table"; headerRow?: string[] | undefined; rows: string[][] }
  | { kind: "pageBreak" }
  | { kind: "notice"; text: string };

export type DeliverableRevisionSummary = {
  id: string;
  deliverableSectionId: string;
  revisionNumber: number;
  previousRevisionId?: string;
  sourceType: string;
  sourceGenerationId?: string;
  sourceGenerationVersionNumber?: number;
  contentStructured: RenderableBlock[];
  contentText: string;
  characterCount: number;
  status: string;
  editVersion: number;
  createdBy: string;
  createdByRole: string;
  createdAt: string;
  updatedAt: string;
  changeNote?: string;
};

export type DeliverableCommentSummary = {
  id: string;
  deliverableId: string;
  deliverableSectionId?: string;
  deliverableRevisionId?: string;
  content: string;
  authorId: string;
  createdAt: string;
  status: string;
  resolvedBy?: string;
  resolvedAt?: string;
};

export const DELIVERABLE_TYPES = [
  "TECHNICAL_MEMO",
  "EXECUTIVE_SUMMARY",
  "COMPLIANCE_MATRIX",
  "CHECKLIST",
  "VALIDATION_REPORT",
  "COST_REPORT",
  "ANNEXES",
  "SIGNATURE_DOCUMENTS",
  "SUBMISSION_PACKAGE",
] as const;

/** Mission — correctif "coverageStatus toujours forcé à COVERED côté écran, quelle que soit la
 *  réponse tapée" : les 5 statuts réels supportés par le backend
 *  (`ComplianceCoverageStatus`, deliverables/domain/compliance-coverage-status.ts), jamais un
 *  sous-ensemble recopié à la main. */
export const COMPLIANCE_COVERAGE_STATUSES = ["COVERED", "PARTIALLY_COVERED", "NOT_COVERED", "NOT_APPLICABLE", "TO_CONFIRM"] as const;

export const COMPLIANCE_COVERAGE_STATUS_LABELS: Record<string, string> = {
  COVERED: "Couvert",
  PARTIALLY_COVERED: "Partiellement couvert",
  NOT_COVERED: "Non couvert",
  NOT_APPLICABLE: "Non applicable",
  TO_CONFIRM: "À confirmer",
};

export const DELIVERABLE_TYPE_LABELS: Record<string, string> = {
  TECHNICAL_MEMO: "Mémoire technique",
  EXECUTIVE_SUMMARY: "Synthèse exécutive",
  COMPLIANCE_MATRIX: "Matrice de conformité",
  CHECKLIST: "Checklist des pièces",
  VALIDATION_REPORT: "Rapport de validation",
  COST_REPORT: "Rapport financier",
  ANNEXES: "Annexes",
  SIGNATURE_DOCUMENTS: "Documents à signer",
  SUBMISSION_PACKAGE: "Package final",
};

export const STRUCTURED_DELIVERABLE_TYPES = new Set(["TECHNICAL_MEMO", "EXECUTIVE_SUMMARY"]);
export const OVERLAY_DELIVERABLE_TYPES = new Set(["COMPLIANCE_MATRIX", "CHECKLIST", "ANNEXES"]);
export const READ_ONLY_DELIVERABLE_TYPES = new Set(["VALIDATION_REPORT", "COST_REPORT", "SIGNATURE_DOCUMENTS", "SUBMISSION_PACKAGE"]);

export const DELIVERABLE_STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: "Non démarré",
  DRAFT: "Brouillon",
  IN_PROGRESS: "En cours",
  READY_FOR_REVIEW: "Prêt pour revue",
  CHANGES_REQUESTED: "Modifications demandées",
  VALIDATED: "Validé",
  APPROVED: "Approuvé",
  EXPORTED: "Exporté",
  BLOCKED: "Bloqué",
};

export function deliverableStatusBadgeClass(status: string): string {
  switch (status) {
    case "VALIDATED":
    case "APPROVED":
    case "EXPORTED":
      return "bg-green-100 text-green-800";
    case "READY_FOR_REVIEW":
    case "IN_PROGRESS":
    case "DRAFT":
      return "bg-amber-100 text-amber-800";
    case "CHANGES_REQUESTED":
    case "BLOCKED":
      return "bg-red-100 text-red-800";
    default:
      return "bg-neutral-200 text-neutral-700";
  }
}

export const REVISION_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Brouillon",
  READY_FOR_REVIEW: "Prêt pour revue",
  CHANGES_REQUESTED: "Modifications demandées",
  VALIDATED: "Validée",
  REJECTED: "Rejetée",
  ARCHIVED: "Archivée",
};

export function revisionStatusBadgeClass(status: string): string {
  switch (status) {
    case "VALIDATED":
      return "bg-green-100 text-green-800";
    case "READY_FOR_REVIEW":
      return "bg-blue-100 text-blue-800";
    case "CHANGES_REQUESTED":
    case "REJECTED":
      return "bg-red-100 text-red-800";
    case "ARCHIVED":
      return "bg-neutral-200 text-neutral-500";
    default:
      return "bg-neutral-200 text-neutral-700";
  }
}

const ORG_TIER = ["OWNER", "ORGANIZATION_ADMIN"];

/** Vérification UI uniquement — le backend revalide toujours via `ClientPermission.ManageDeliverable`
 *  (affectation client réelle nécessaire pour un rôle non-organisation), jamais une autorité côté frontend. */
export function canManageDeliverable(role: string | undefined): boolean {
  return role !== undefined && role !== "READ_ONLY" && role !== "EXTERNAL_CONSULTANT";
}

/** Vérification UI uniquement — le backend revalide toujours via `ClientPermission.ValidateDeliverable`. */
export function canValidateDeliverable(role: string | undefined): boolean {
  return role !== undefined && role !== "READ_ONLY" && role !== "EXTERNAL_CONSULTANT" && role !== "CONTRIBUTOR";
}

/** Vérification UI uniquement — le backend revalide toujours via `DeliverablePermission.ManageDeliverableTemplates`/
 *  `ManageDocumentThemes` (OWNER/ORGANIZATION_ADMIN uniquement, jamais délégable). */
export function canManageDeliverableTemplates(role: string | undefined): boolean {
  return role !== undefined && ORG_TIER.includes(role);
}

/** Convertit le contenu structuré en texte brut pour un aperçu rapide sans mise en forme. */
export function blocksToPreviewText(blocks: RenderableBlock[]): string {
  return blocks
    .map((block) => {
      switch (block.kind) {
        case "heading":
        case "paragraph":
        case "notice":
          return block.text;
        case "list":
          return block.items.join("\n");
        case "table":
          return [block.headerRow?.join(" | "), ...block.rows.map((r) => r.join(" | "))].filter(Boolean).join("\n");
        default:
          return "";
      }
    })
    .filter(Boolean)
    .join("\n\n");
}
