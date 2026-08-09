export type DocumentTemplateScope = "SYSTEM" | "ORGANIZATION";
export type FieldType = "STRING" | "DATE" | "CURRENCY" | "PERCENTAGE" | "BOOLEAN" | "CHECKBOX" | "MULTILINE" | "LIST" | "TABLE";

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  STRING: "Texte",
  DATE: "Date",
  CURRENCY: "Montant",
  PERCENTAGE: "Pourcentage",
  BOOLEAN: "Oui/Non",
  CHECKBOX: "Case à cocher",
  MULTILINE: "Texte long",
  LIST: "Liste",
  TABLE: "Tableau",
};

export type DiscoveredPlaceholder = { fieldKey: string; occurrences: number };

export type DocumentTemplateFieldMapping = {
  fieldKey: string;
  label: string;
  fieldType: FieldType;
  required: boolean;
  formatOptions?: Record<string, unknown>;
};

export type DocumentTemplateVersionSummary = {
  id: string;
  documentTemplateId: string;
  version: number;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  discoveredPlaceholders: DiscoveredPlaceholder[];
  allowPartialGeneration: boolean;
  fieldMappings: DocumentTemplateFieldMapping[];
  createdAt: string;
  activatedAt?: string;
};

export type DocumentTemplateSummary = {
  id: string;
  scope: DocumentTemplateScope;
  name: string;
  description?: string;
  createdAt: string;
  activeVersion?: DocumentTemplateVersionSummary;
};

export type DocumentTemplateDetail = DocumentTemplateSummary & { versions: DocumentTemplateVersionSummary[] };

export type FieldProvenanceEntry = { fieldKey: string; provided: boolean; sourceEntityType?: string; sourceEntityId?: string; sourceEntityVersion?: string; valuePath?: string };

export type GeneratedDocumentRevisionSummary = {
  id: string;
  generatedDocumentId: string;
  revisionNumber: number;
  previousRevisionId?: string;
  documentTemplateVersionId: string;
  status: "PENDING" | "GENERATING" | "COMPLETED" | "FAILED";
  dataSnapshot: Record<string, unknown>;
  provenance: FieldProvenanceEntry[];
  missingFields: string[];
  reviewStatus: "GENERATED" | "REVIEWED" | "VALIDATED";
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
};

export type GeneratedDocumentSummary = {
  id: string;
  tenderId: string;
  documentTemplateId: string;
  title: string;
  createdAt: string;
  revisions?: GeneratedDocumentRevisionSummary[];
};

/** Vérification UI uniquement — le backend revalide toujours via `DocumentGenerationPermission.
 *  ManageTemplates` (OWNER/ORGANIZATION_ADMIN uniquement). */
export function canManageDocumentTemplates(role: string | undefined): boolean {
  return role === "OWNER" || role === "ORGANIZATION_ADMIN";
}

/** Vérification UI uniquement — le backend revalide toujours via `TenderPermission.
 *  UseDocumentGeneration` + `ClientPermission.ManageDocumentGeneration` (affectation client réelle
 *  nécessaire pour un rôle CONTRIBUTOR). */
export function canUseDocumentGeneration(role: string | undefined): boolean {
  return role === "OWNER" || role === "ORGANIZATION_ADMIN" || role === "BID_MANAGER" || role === "CONTRIBUTOR";
}

export function documentGenerationRevisionStatusBadgeClass(status: GeneratedDocumentRevisionSummary["status"]): string {
  switch (status) {
    case "COMPLETED":
      return "bg-green-100 text-green-800";
    case "FAILED":
      return "bg-red-100 text-red-800";
    default:
      return "bg-neutral-200 text-neutral-700";
  }
}
