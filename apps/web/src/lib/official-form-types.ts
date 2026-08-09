/** V2 Sprint 11B — types miroir des DTOs backend `AdministrativeFormReadiness`/
 *  `AdministrativeFormFieldReadiness` (module `administrative-dossier`, résolveurs DC1/DC2/DC4
 *  réels) — jamais un second calcul de statut côté frontend, toujours affiché tel que renvoyé par
 *  le backend (mission §25 "les règles métier sont calculées côté backend"). */
export type OfficialFormFieldStatus = "AVAILABLE" | "MISSING" | "NOT_APPLICABLE" | "NEEDS_REVIEW";

export type OfficialFormFieldReadiness = {
  fieldKey: string;
  label: string;
  status: OfficialFormFieldStatus;
  required: boolean;
  value?: string | boolean;
  source?: string;
  reviewReason?: string;
};

export type OfficialFormReadiness = {
  documentType: "DC1" | "DC2" | "DC4";
  fields: OfficialFormFieldReadiness[];
  applicableFieldCount: number;
  availableFieldCount: number;
  missingFieldKeys: string[];
  needsReviewFieldKeys: string[];
  readinessPercentage: number;
};

export type OfficialFormRevisionSummary = {
  id: string;
  revisionNumber: number;
  status: "PENDING" | "GENERATING" | "COMPLETED" | "FAILED";
  artifactDocumentId?: string;
  missingFields: string[];
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
};

export type OfficialFormGeneratedDocumentSummary = {
  id: string;
  tenderId: string;
  title: string;
  createdAt: string;
  revisions?: OfficialFormRevisionSummary[];
};

export type ConsortiumMemberSummary = {
  memberId: string;
  name: string;
  legalIdentifier?: string;
  role: string;
  scopeDescription?: string;
  percentage?: number;
};

export type ConsortiumSummary = {
  id: string;
  tenderId: string;
  type: "JOINT" | "SOLIDARITY" | "OTHER";
  members: ConsortiumMemberSummary[];
  mandataireMemberId?: string;
};

export function officialFormFieldStatusLabel(status: OfficialFormFieldStatus): string {
  switch (status) {
    case "AVAILABLE":
      return "Disponible";
    case "MISSING":
      return "Manquant";
    case "NOT_APPLICABLE":
      return "Non applicable";
    case "NEEDS_REVIEW":
      return "À confirmer";
    default:
      return status;
  }
}

export function officialFormFieldStatusBadgeClass(status: OfficialFormFieldStatus): string {
  switch (status) {
    case "AVAILABLE":
      return "bg-green-50 text-green-700 border-green-200";
    case "MISSING":
      return "bg-red-50 text-red-700 border-red-200";
    case "NEEDS_REVIEW":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "NOT_APPLICABLE":
    default:
      return "bg-neutral-100 text-neutral-500 border-neutral-200";
  }
}

export function readinessBadgeClass(percentage: number): string {
  if (percentage >= 90) return "bg-green-50 text-green-700 border-green-200";
  if (percentage >= 60) return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-red-50 text-red-700 border-red-200";
}
