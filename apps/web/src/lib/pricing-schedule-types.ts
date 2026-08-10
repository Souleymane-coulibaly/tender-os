export type FinancialDocumentType = "BPU" | "DPGF" | "DQE" | "OTHER_FINANCIAL_SCHEDULE";
export type PricingScheduleStatus = "DRAFT" | "READY" | "VALIDATED" | "EXPORTED";
export type PricingScheduleVersionStatus = "DRAFT" | "IN_REVIEW" | "VALIDATED";
export type PricingScheduleLineKind = "PRICE_ITEM" | "SECTION_HEADER" | "SUBTOTAL" | "NOTE";
export type PricingScheduleLineStatus = "EMPTY" | "PRICED" | "NEEDS_REVIEW";
export type ControlSeverity = "ERROR" | "WARNING" | "INFO";

export type PricingSchedule = {
  id: string;
  organizationId: string;
  tenderId: string;
  lotId?: string;
  clientAccountId: string;
  financialDocumentType: FinancialDocumentType;
  sourceDocumentId: string;
  sourceDocumentVersionId: string;
  status: PricingScheduleStatus;
  currentVersionId?: string;
  currentVersionNumber: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type PricingScheduleVersion = {
  id: string;
  organizationId: string;
  pricingScheduleId: string;
  versionNumber: number;
  status: PricingScheduleVersionStatus;
  sourceDocumentVersionId: string;
  mappingVersion: number;
  createdBy: string;
  createdAt: string;
  validatedBy?: string;
  validatedAt?: string;
};

export type PricingScheduleLine = {
  id: string;
  organizationId: string;
  pricingScheduleVersionId: string;
  sheetName: string;
  rowNumber: number;
  kind: PricingScheduleLineKind;
  hierarchyLevel: number;
  parentLineId?: string;
  designation: string;
  unit?: string;
  quantity?: string;
  designationCellRef?: string;
  quantityCellRef?: string;
  buyerUnitPriceCellRef?: string;
  buyerTotalCellRef?: string;
  proposedUnitPrice?: string;
  proposedTotal?: string;
  currencyCode: string;
  costBreakdown?: Record<string, unknown>;
  candidateComment?: string;
  status: PricingScheduleLineStatus;
  matchingKey?: string;
  createdAt: string;
  updatedAt: string;
};

export type PricingScheduleFinalFile = {
  id: string;
  organizationId: string;
  pricingScheduleVersionId: string;
  documentId: string;
  documentVersionId: string;
  injectedCellCount: number;
  generatedBy: string;
  generatedAt: string;
};

export type PricingControlFinding = {
  code: string;
  severity: ControlSeverity;
  pricingScheduleLineId?: string;
  message: string;
};

export type PricingControlsResult = {
  findings: PricingControlFinding[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
};

export const FINANCIAL_DOCUMENT_TYPE_LABELS: Record<FinancialDocumentType, string> = {
  BPU: "BPU — Bordereau des prix unitaires",
  DPGF: "DPGF — Décomposition du prix global et forfaitaire",
  DQE: "DQE — Décomposition quantitative estimative",
  OTHER_FINANCIAL_SCHEDULE: "Autre pièce financière",
};

export const PRICING_SCHEDULE_STATUS_LABELS: Record<PricingScheduleStatus, string> = {
  DRAFT: "Brouillon",
  READY: "Prêt",
  VALIDATED: "Validé",
  EXPORTED: "Généré",
};

export const LINE_KIND_LABELS: Record<PricingScheduleLineKind, string> = {
  PRICE_ITEM: "Ligne de prix",
  SECTION_HEADER: "Titre de section",
  SUBTOTAL: "Sous-total",
  NOTE: "Note",
};

export function pricingScheduleStatusBadgeClass(status: PricingScheduleStatus): string {
  switch (status) {
    case "VALIDATED":
      return "bg-green-100 text-green-800";
    case "EXPORTED":
      return "bg-purple-100 text-purple-800";
    case "READY":
      return "bg-blue-100 text-blue-800";
    default:
      return "bg-neutral-200 text-neutral-700";
  }
}

export function lineStatusBadgeClass(status: PricingScheduleLineStatus): string {
  switch (status) {
    case "PRICED":
      return "bg-green-100 text-green-800";
    case "NEEDS_REVIEW":
      return "bg-amber-100 text-amber-800";
    default:
      return "bg-neutral-200 text-neutral-700";
  }
}

export function controlSeverityBadgeClass(severity: ControlSeverity): string {
  switch (severity) {
    case "ERROR":
      return "bg-red-100 text-red-800";
    case "WARNING":
      return "bg-amber-100 text-amber-800";
    default:
      return "bg-blue-100 text-blue-800";
  }
}

/** Vérification UI uniquement — le backend revalide toujours via `TenderPermission.
 *  UsePricingSchedule` + `ClientPermission.ManagePricingSchedule`/`ValidatePricingSchedule`/
 *  `GeneratePricingScheduleFiles` (affectation client réelle nécessaire pour un rôle CONTRIBUTOR).
 *  Même palier que `canUseTechnicalMemo`. */
export function canUsePricingSchedule(role: string | undefined): boolean {
  return role === "OWNER" || role === "ORGANIZATION_ADMIN" || role === "BID_MANAGER" || role === "CONTRIBUTOR";
}
