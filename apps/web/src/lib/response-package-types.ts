export type ResponsePackageStatus = "DRAFT" | "IN_REVIEW" | "READY" | "VALIDATED" | "EXPORTED" | "INVALIDATED";
export type ResponsePackageVersionStatus = "DRAFT" | "IN_REVIEW" | "VALIDATED";
export type PackageItemCategory = "ADMINISTRATIVE" | "TECHNICAL" | "FINANCIAL" | "LEGAL" | "CERTIFICATE" | "ANNEX" | "OTHER";
export type PackageItemRequirementType = "REQUIRED" | "OPTIONAL" | "CONDITIONAL";
export type PackageItemApplicabilityStatus = "APPLICABLE" | "NOT_APPLICABLE" | "NEEDS_REVIEW";
export type PackageItemStatus = "READY" | "MISSING_BLOCKING" | "MISSING_NON_BLOCKING" | "NOT_APPLICABLE" | "NEEDS_REVIEW";

export type ResponsePackage = {
  id: string;
  organizationId: string;
  tenderId: string;
  lotId?: string;
  clientAccountId: string;
  status: ResponsePackageStatus;
  currentVersionId?: string;
  currentVersionNumber: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type ResponsePackageVersion = {
  id: string;
  organizationId: string;
  responsePackageId: string;
  versionNumber: number;
  status: ResponsePackageVersionStatus;
  createdBy: string;
  createdAt: string;
  validatedBy?: string;
  validatedAt?: string;
};

export type PackageItem = {
  id: string;
  organizationId: string;
  responsePackageVersionId: string;
  category: PackageItemCategory;
  label: string;
  documentType?: string;
  sourceType: string;
  sourceId?: string;
  documentId?: string;
  documentVersionId?: string;
  requirementType: PackageItemRequirementType;
  applicabilityStatus: PackageItemApplicabilityStatus;
  conditionText?: string;
  status: PackageItemStatus;
  lotId?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type PackageArtifact = {
  id: string;
  organizationId: string;
  responsePackageVersionId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  generatedBy: string;
  generatedAt: string;
};

export type PackageCompleteness = {
  requiredApplicableTotal: number;
  requiredAvailable: number;
  requiredMissing: number;
  requiredMissingLabels: string[];
  optionalApplicableTotal: number;
  optionalAvailable: number;
  optionalMissing: number;
  notApplicableTotal: number;
  needsReviewTotal: number;
  requiredCompletenessRatio?: number;
  ready: boolean;
};

export const RESPONSE_PACKAGE_STATUS_LABELS: Record<ResponsePackageStatus, string> = {
  DRAFT: "Brouillon",
  IN_REVIEW: "En revue",
  READY: "Prêt",
  VALIDATED: "Validé",
  EXPORTED: "Généré",
  INVALIDATED: "Invalidé",
};

export const CATEGORY_LABELS: Record<PackageItemCategory, string> = {
  ADMINISTRATIVE: "Administratif",
  TECHNICAL: "Technique",
  FINANCIAL: "Financier",
  LEGAL: "Juridique",
  CERTIFICATE: "Certificat",
  ANNEX: "Annexe",
  OTHER: "Autre",
};

export const REQUIREMENT_TYPE_LABELS: Record<PackageItemRequirementType, string> = {
  REQUIRED: "Obligatoire",
  OPTIONAL: "Facultatif",
  CONDITIONAL: "Conditionnel",
};

export const APPLICABILITY_LABELS: Record<PackageItemApplicabilityStatus, string> = {
  APPLICABLE: "Applicable",
  NOT_APPLICABLE: "Non applicable",
  NEEDS_REVIEW: "À vérifier",
};

export function responsePackageStatusBadgeClass(status: ResponsePackageStatus): string {
  switch (status) {
    case "VALIDATED":
      return "bg-green-100 text-green-800";
    case "EXPORTED":
      return "bg-purple-100 text-purple-800";
    case "READY":
      return "bg-blue-100 text-blue-800";
    case "INVALIDATED":
      return "bg-red-100 text-red-800";
    default:
      return "bg-neutral-200 text-neutral-700";
  }
}

export function packageItemStatusBadge(status: PackageItemStatus): { label: string; className: string } {
  switch (status) {
    case "READY":
      return { label: "✓ Prêt", className: "bg-green-100 text-green-800" };
    case "MISSING_BLOCKING":
      return { label: "❌ Manquant obligatoire", className: "bg-red-100 text-red-800" };
    case "MISSING_NON_BLOCKING":
      return { label: "○ Facultatif absent", className: "bg-neutral-200 text-neutral-700" };
    case "NOT_APPLICABLE":
      return { label: "— Non applicable", className: "bg-neutral-100 text-neutral-500" };
    case "NEEDS_REVIEW":
      return { label: "⚠ À vérifier", className: "bg-amber-100 text-amber-800" };
  }
}

/** Vérification UI uniquement — le backend revalide toujours via `TenderPermission.
 *  UseResponsePackage` + `ClientPermission.ManageResponsePackage`/`ValidateResponsePackage`/
 *  `GenerateResponsePackage`. Même palier que `canUsePricingSchedule`. */
export function canUseResponsePackage(role: string | undefined): boolean {
  return role === "OWNER" || role === "ORGANIZATION_ADMIN" || role === "BID_MANAGER" || role === "CONTRIBUTOR";
}
