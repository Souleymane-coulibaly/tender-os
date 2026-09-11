export type AdministrativeDocumentTypeMetadata = {
  code: string;
  label: string;
  category: string;
  description: string;
  hasValidityPeriod: boolean;
  canRequireSignature: boolean;
};

export type AdministrativeDossierSummary = {
  id: string;
  tenderId: string;
  status: string;
  completionPercentage: number;
  validationStatus: string;
  lastValidatedAt?: string;
  lastValidatedBy?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type AdministrativeDossierCapabilities = {
  canView: boolean;
  canEdit: boolean;
  canValidate: boolean;
  canGenerateDc1: boolean;
  canGenerateDc2: boolean;
  canGenerateDc4: boolean;
  canGenerateDume: boolean;
  canGenerateEngagementAct: boolean;
  signatureSummary: { required: number; pending: number; signed: number };
  blockers: string[];
  warnings: string[];
};

export type AdministrativeRequirementSummary = {
  id: string;
  tenderId: string;
  title: string;
  description?: string;
  requirementType: string;
  expectedDocumentType: string;
  required: boolean;
  applicable: boolean;
  dueDate?: string;
  validityRule?: string;
  signatureRequired: boolean;
  origin: string;
  createdBy: string;
  validatedBy?: string;
  validationStatus: string;
  matchedDocumentId?: string;
  createdAt: string;
  updatedAt: string;
};

export type AdministrativeChecklistLine = {
  requirementId: string;
  title: string;
  expectedDocumentType: string;
  required: boolean;
  applicable: boolean;
  state: string;
  matchedDocumentId?: string;
};

export type AdministrativeChecklist = {
  lines: AdministrativeChecklistLine[];
  completionPercentage: number;
};

export type AdministrativeDocumentRevisionSummary = {
  id: string;
  administrativeDocumentId: string;
  revisionNumber: number;
  documentId?: string;
  documentFileName?: string;
  documentMimeType?: string;
  expiresAt?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type AdministrativeDocumentSummary = {
  id: string;
  administrativeDossierId: string;
  tenderId: string;
  documentType: string;
  label: string;
  requirementId?: string;
  validatedRevisionId?: string;
  validatedAt?: string;
  validatedBy?: string;
  signatureMode: string;
  signatureStatus: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  revisions: AdministrativeDocumentRevisionSummary[];
};

// --- Sprint 8C Phase 2 ---

export type ConsortiumMember = {
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
  type: string;
  legalForm?: string;
  liabilityMode?: string;
  mandataireMemberId?: string;
  members: ConsortiumMember[];
  createdAt: string;
  updatedAt: string;
};

export type Dc1DeclarationSummary = {
  id: string;
  tenderId: string;
  candidateType: string;
  consortiumId?: string;
  declarations?: string;
  signatoryName?: string;
  signatoryCapacity?: string;
  signingPowerId?: string;
  administrativeDocumentId?: string;
  createdAt: string;
  updatedAt: string;
};

export type StructuredCapacityStatement = {
  legalIdentity?: string;
  revenueByYear?: { year: number; amountValue: number; amountCurrency: string }[];
  financialCapacity?: string;
  technicalCapacity?: string;
  humanResources?: string;
  technicalResources?: string;
  insurances?: string;
  certifications?: string;
  additionalInfo?: string;
};

export type Dc2DeclarationSummary = {
  id: string;
  tenderId: string;
  currentVersionNumber: number;
  createdAt: string;
  updatedAt: string;
};
export type Dc2DeclarationVersionSummary = {
  id: string;
  dc2DeclarationId: string;
  version: number;
  data: StructuredCapacityStatement;
  createdBy: string;
  createdAt: string;
};
export type Dc2DeclarationWithVersions = {
  declaration: Dc2DeclarationSummary;
  versions: Dc2DeclarationVersionSummary[];
};

export type DumeDeclarationSummary = {
  id: string;
  tenderId: string;
  currentVersionNumber: number;
  createdAt: string;
  updatedAt: string;
};
export type DumeDeclarationVersionSummary = {
  id: string;
  dumeDeclarationId: string;
  version: number;
  data: StructuredCapacityStatement;
  createdBy: string;
  createdAt: string;
};
export type DumeDeclarationWithVersions = {
  declaration: DumeDeclarationSummary;
  versions: DumeDeclarationVersionSummary[];
};

export type SubcontractorDeclarationSummary = {
  id: string;
  tenderId: string;
  subcontractorName: string;
  subcontractorLegalIdentifier?: string;
  servicesDescription: string;
  amountValue: number;
  amountCurrency: string;
  percentageOfTotal?: number;
  paymentTerms?: string;
  directPaymentApplicable?: boolean;
  requiredDocuments: string[];
  administrativeDocumentId?: string;
  createdAt: string;
  updatedAt: string;
};

// --- Sprint 8C.1 (formulaires officiels remplissables) ---

export type OfficialFormFieldIssue = {
  fieldPath: string;
  code: string;
  message: string;
  severity: "ERROR" | "WARNING";
  blocking: boolean;
  suggestedAction?: string;
};

export type OfficialFormReferenceTemplate =
  | {
      kind: "OFFICIAL";
      officialTemplateId: string;
      officialName: string;
      version: number;
      fileDocumentId: string;
      fileDocumentVersionId: string;
    }
  | { kind: "BUYER"; fileDocumentId: string; fileDocumentVersionId: string };

export type OfficialFormPreparationResult = {
  documentType: string;
  scopeId: string;
  values: Record<string, string>;
  fieldSources: Record<string, string>;
  missingFields: OfficialFormFieldIssue[];
  warnings: OfficialFormFieldIssue[];
  canGenerate: boolean;
  referenceTemplate?: OfficialFormReferenceTemplate;
  administrativeDocumentId?: string;
};

export type EngagementActSummary = {
  id: string;
  tenderId: string;
  reference?: string;
  lotReference?: string;
  object?: string;
  durationMonths?: number;
  variants?: string;
  subcontractingSummary?: string;
  ribDocumentId?: string;
  signatoryName?: string;
  signatoryCapacity?: string;
  administrativeDocumentId?: string;
  pricingEstimateId?: string;
  pricingEstimateVersionNumber?: number;
  frozenAmountValue?: number;
  frozenAmountCurrency?: string;
  frozenAt?: string;
  frozenBy?: string;
  createdAt: string;
  updatedAt: string;
};

export type SigningPowerSummary = {
  id: string;
  tenderId: string;
  holderName: string;
  representedEntityDescription: string;
  administrativeDocumentId?: string;
  validFrom?: string;
  expiresAt?: string;
  scope: string;
  limitations?: string;
  verifiedBy?: string;
  verifiedAt?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export const CONSORTIUM_TYPE_LABELS: Record<string, string> = {
  JOINT: "Groupement conjoint",
  SOLIDARITY: "Groupement solidaire",
  OTHER: "Autre",
};
export const DC1_CANDIDATE_TYPE_LABELS: Record<string, string> = {
  INDIVIDUAL: "Candidat individuel",
  CONSORTIUM: "Groupement",
};
export const SIGNING_POWER_STATUS_LABELS: Record<string, string> = {
  UNVERIFIED: "Non vérifié",
  VALID: "Valide",
  EXPIRED: "Expiré",
};
export const ADMINISTRATIVE_SIGNATURE_MODE_LABELS: Record<string, string> = {
  NOT_REQUIRED: "Non requise",
  MANUAL: "Manuelle",
  ELECTRONIC: "Électronique",
  EXTERNAL: "Preuve externe",
};
export const ADMINISTRATIVE_SIGNATURE_STATUS_LABELS: Record<string, string> = {
  NOT_REQUIRED: "Non requise",
  PENDING: "En attente",
  SIGNED: "Signée",
  REJECTED: "Rejetée",
  EXPIRED: "Expirée",
  CANCELLED: "Annulée",
};

export const ADMINISTRATIVE_DOSSIER_STATUS_LABELS: Record<string, string> = {
  INCOMPLETE: "Incomplet",
  TO_COMPLETE: "À compléter",
  IN_VERIFICATION: "En vérification",
  READY: "Prêt",
  BLOCKED: "Bloqué",
};

export const ADMINISTRATIVE_CHECKLIST_STATE_LABELS: Record<string, string> = {
  MANQUANT: "Manquant",
  A_COMPLETER: "À compléter",
  A_VERIFIER: "À vérifier",
  EXPIRE: "Expiré",
  NON_APPLICABLE: "Non applicable",
  EN_VALIDATION: "En validation",
  VALIDE: "Validé",
  PRET: "Prêt",
};

export function administrativeDossierStatusBadgeClass(status: string): string {
  switch (status) {
    case "READY":
      return "bg-emerald-100 text-emerald-800";
    case "BLOCKED":
      return "bg-red-100 text-red-800";
    case "IN_VERIFICATION":
      return "bg-blue-100 text-blue-800";
    case "TO_COMPLETE":
      return "bg-amber-100 text-amber-800";
    default:
      return "bg-neutral-100 text-neutral-700";
  }
}

export function administrativeChecklistStateBadgeClass(state: string): string {
  switch (state) {
    case "VALIDE":
    case "PRET":
      return "bg-emerald-100 text-emerald-800";
    case "EXPIRE":
      return "bg-red-100 text-red-800";
    case "A_VERIFIER":
    case "EN_VALIDATION":
      return "bg-blue-100 text-blue-800";
    case "A_COMPLETER":
      return "bg-amber-100 text-amber-800";
    case "NON_APPLICABLE":
      return "bg-neutral-100 text-neutral-500";
    default:
      return "bg-neutral-100 text-neutral-700";
  }
}

/** Statut d'une révision générée d'un formulaire officiel — `GeneratedDocumentRevisionStatus` côté API. */
export const GENERATED_REVISION_STATUS_LABELS: Record<string, string> = {
  PENDING: "En attente",
  GENERATING: "Génération en cours",
  COMPLETED: "Terminée",
  FAILED: "Échec",
};

/** Élément léger d'une liste de documents administratifs (sélecteur du document preuve) — sans les
 *  révisions, qu'un sélecteur n'affiche pas. */
export type AdministrativeDocumentListItem = {
  id: string;
  label: string;
  documentType: string;
  validatedRevisionId?: string;
  signatureStatus: string;
};
