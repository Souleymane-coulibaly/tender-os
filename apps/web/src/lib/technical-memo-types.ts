export type TechnicalMemoTemplateOrigin = "COMPANY_TEMPLATE" | "DCE_REQUIRED_TEMPLATE" | "TENDEROS_SYSTEM";
export type TechnicalMemoStatus = "DRAFT" | "READY" | "EXPORTED";
export type TechnicalMemoSectionCategory =
  | "COMPANY_PRESENTATION"
  | "UNDERSTANDING"
  | "METHODOLOGY"
  | "ORGANIZATION"
  | "HUMAN_RESOURCES"
  | "TECHNICAL_RESOURCES"
  | "PLANNING"
  | "QUALITY"
  | "SECURITY"
  | "ENVIRONMENT"
  | "CSR"
  | "CONTINUITY"
  | "REFERENCES"
  | "INNOVATION"
  | "GOVERNANCE"
  | "OTHER"
  | "NEEDS_MAPPING";
export type TechnicalMemoSectionStatus = "EMPTY" | "READY_TO_GENERATE" | "GENERATING" | "DRAFT" | "NEEDS_REVIEW" | "VALIDATED" | "FAILED";
export type TechnicalMemoSectionRevisionSource = "AI_GENERATED" | "MANUAL" | "AI_REGENERATED";
export type TechnicalMemoCitationSourceType = "FINDING" | "KNOWLEDGE_ENTRY" | "CANDIDATE_FIELD" | "REFERENCE" | "DCE_CHUNK";
export type TechnicalMemoCoverageStatus = "COVERED" | "PARTIALLY_COVERED" | "NOT_COVERED" | "NOT_APPLICABLE" | "NEEDS_REVIEW";

export type TechnicalMemo = {
  id: string;
  organizationId: string;
  tenderId: string;
  clientAccountId: string;
  lotId?: string;
  templateOrigin: TechnicalMemoTemplateOrigin;
  originalDocumentId?: string;
  originalDocumentVersionId?: string;
  documentTemplateId?: string;
  status: TechnicalMemoStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type TechnicalMemoSection = {
  id: string;
  organizationId: string;
  technicalMemoId: string;
  parentSectionId?: string;
  sectionKey: string;
  title: string;
  order: number;
  level: number;
  category: TechnicalMemoSectionCategory;
  categoryConfirmedByUser: boolean;
  instructionText?: string;
  isTable: boolean;
  wordLimit?: number;
  pageLimit?: number;
  status: TechnicalMemoSectionStatus;
  content?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type TechnicalMemoSectionCitation = {
  id: string;
  sourceType: TechnicalMemoCitationSourceType;
  findingType?: string;
  findingId?: string;
  knowledgeEntryId?: string;
  knowledgeEntryVersionId?: string;
  companyReferenceId?: string;
  candidateFieldPath?: string;
  documentId?: string;
  chunkSequence?: number;
  pageStart?: number;
  pageEnd?: number;
  label: string;
  excerpt?: string;
};

export type TechnicalMemoSectionRevision = {
  id: string;
  technicalMemoSectionId: string;
  revisionNumber: number;
  source: TechnicalMemoSectionRevisionSource;
  content: string;
  userInstruction?: string;
  aiModel?: string;
  promptVersion?: number;
  missingDataNotes: string[];
  citations: TechnicalMemoSectionCitation[];
  createdBy: string;
  createdAt: string;
};

export type TechnicalMemoSectionRequirement = {
  id: string;
  technicalMemoSectionId: string;
  findingType: string;
  findingId: string;
  coverageStatus: TechnicalMemoCoverageStatus;
  coverageReason?: string;
  confirmedByUser: boolean;
};

export type TechnicalMemoCoverage = {
  totalRequirements: number;
  covered: number;
  partiallyCovered: number;
  notCovered: number;
  notApplicable: number;
  needsReview: number;
  coverageRatio: number;
};

export const TEMPLATE_ORIGIN_LABELS: Record<TechnicalMemoTemplateOrigin, string> = {
  COMPANY_TEMPLATE: "Modèle de l'entreprise",
  DCE_REQUIRED_TEMPLATE: "Trame imposée par le DCE",
  TENDEROS_SYSTEM: "Modèle standard TenderOS",
};

export const MEMO_STATUS_LABELS: Record<TechnicalMemoStatus, string> = {
  DRAFT: "Brouillon",
  READY: "Prêt",
  EXPORTED: "Exporté",
};

export const SECTION_CATEGORY_LABELS: Record<TechnicalMemoSectionCategory, string> = {
  COMPANY_PRESENTATION: "Présentation de l'entreprise",
  UNDERSTANDING: "Compréhension du besoin",
  METHODOLOGY: "Méthodologie",
  ORGANIZATION: "Organisation",
  HUMAN_RESOURCES: "Moyens humains",
  TECHNICAL_RESOURCES: "Moyens techniques",
  PLANNING: "Planning",
  QUALITY: "Qualité",
  SECURITY: "Sécurité",
  ENVIRONMENT: "Environnement",
  CSR: "RSE",
  CONTINUITY: "Continuité d'activité",
  REFERENCES: "Références",
  INNOVATION: "Innovation",
  GOVERNANCE: "Gouvernance",
  OTHER: "Autre",
  NEEDS_MAPPING: "À catégoriser",
};

export const SECTION_STATUS_LABELS: Record<TechnicalMemoSectionStatus, string> = {
  EMPTY: "Vide",
  READY_TO_GENERATE: "Prête à générer",
  GENERATING: "Génération en cours",
  DRAFT: "Brouillon IA",
  NEEDS_REVIEW: "À revoir",
  VALIDATED: "Validée",
  FAILED: "Échec",
};

export const COVERAGE_STATUS_LABELS: Record<TechnicalMemoCoverageStatus, string> = {
  COVERED: "Couverte",
  PARTIALLY_COVERED: "Partiellement couverte",
  NOT_COVERED: "Non couverte",
  NOT_APPLICABLE: "Non applicable",
  NEEDS_REVIEW: "À vérifier",
};

export const CITATION_SOURCE_LABELS: Record<TechnicalMemoCitationSourceType, string> = {
  FINDING: "Exigence DCE",
  KNOWLEDGE_ENTRY: "Base de connaissances",
  CANDIDATE_FIELD: "Profil entreprise",
  REFERENCE: "Référence client",
  DCE_CHUNK: "Extrait du DCE",
};

export function sectionStatusBadgeClass(status: TechnicalMemoSectionStatus): string {
  switch (status) {
    case "VALIDATED":
      return "bg-green-100 text-green-800";
    case "FAILED":
      return "bg-red-100 text-red-800";
    case "NEEDS_REVIEW":
      return "bg-amber-100 text-amber-800";
    case "DRAFT":
      return "bg-blue-100 text-blue-800";
    case "GENERATING":
      return "bg-purple-100 text-purple-800";
    default:
      return "bg-neutral-200 text-neutral-700";
  }
}

export function coverageStatusBadgeClass(status: TechnicalMemoCoverageStatus): string {
  switch (status) {
    case "COVERED":
      return "bg-green-100 text-green-800";
    case "PARTIALLY_COVERED":
      return "bg-amber-100 text-amber-800";
    case "NOT_COVERED":
      return "bg-red-100 text-red-800";
    case "NOT_APPLICABLE":
      return "bg-neutral-200 text-neutral-600";
    default:
      return "bg-neutral-200 text-neutral-700";
  }
}

/** Vérification UI uniquement — le backend revalide toujours via `TenderPermission.
 *  UseTechnicalMemo` + `ClientPermission.ManageTechnicalMemo` (affectation client réelle nécessaire
 *  pour un rôle CONTRIBUTOR). Même palier que `canUseDocumentGeneration`. */
export function canUseTechnicalMemo(role: string | undefined): boolean {
  return role === "OWNER" || role === "ORGANIZATION_ADMIN" || role === "BID_MANAGER" || role === "CONTRIBUTOR";
}
