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

/** Checkpoint 2.1-A5 — libellés humains pour `FormFieldSource` (backend
 *  `administrative-dossier/domain/form-field-source.ts`), jamais la clé technique brute affichée
 *  telle quelle (mission §12 "uniformiser la terminologie"). `CLIENT_PROFILE` (legacy) et
 *  `CANDIDATE_COMPANY_PROFILE` (A1-A4) restent deux libellés distincts, jamais fusionnés. */
export function formFieldSourceLabel(source: string | undefined): string {
  switch (source) {
    case "ORGANIZATION_PROFILE":
      return "Profil organisation";
    case "CLIENT_PROFILE":
      return "Profil entreprise du client";
    case "CANDIDATE_COMPANY_PROFILE":
      return "Entreprise candidate";
    case "TENDER":
      return "Marché";
    case "LOT":
      return "Lot";
    case "GROUP_MEMBER":
      return "Membre du groupement";
    case "SUBCONTRACTOR":
      return "Sous-traitant";
    case "PRICING_VERSION":
      return "Chiffrage";
    case "ADMINISTRATIVE_DOSSIER":
      return "Dossier administratif";
    case "USER_INPUT":
      return "Saisie manuelle";
    case "BUYER_TEMPLATE":
      return "Gabarit acheteur";
    case "IMPORTED_DOCUMENT":
      return "Document importé";
    default:
      return "—";
  }
}

export function readinessBadgeClass(percentage: number): string {
  if (percentage >= 90) return "bg-green-50 text-green-700 border-green-200";
  if (percentage >= 60) return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-red-50 text-red-700 border-red-200";
}
