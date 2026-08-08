export type KnowledgePage<T> = { items: T[]; nextCursor: string | null; total: number };

export type KnowledgeCategory =
  | "COMPANY_PRESENTATION"
  | "CLIENT_REFERENCE"
  | "CONSULTANT_PROFILE"
  | "CERTIFICATION"
  | "METHODOLOGY"
  | "SERVICE_OFFER"
  | "CASE_STUDY"
  | "SECURITY"
  | "GDPR"
  | "CSR"
  | "ADMINISTRATIVE"
  | "TECHNICAL_MEMORY"
  | "RESPONSE_TEMPLATE"
  | "COMMERCIAL_DOCUMENT"
  | "IMAGE"
  | "OTHER";

export type KnowledgeEntryStatus = "DRAFT" | "PROCESSING" | "READY" | "PARTIALLY_READY" | "FAILED" | "ARCHIVED";
export type KnowledgeSourceType = "MANUAL" | "DOCUMENT_IMPORT";
export type KnowledgeDocumentStatus = "PENDING" | "PROCESSING" | "READY" | "FAILED";

export type KnowledgeTagSummary = { id: string; label: string; displayLabel: string; createdAt: string };

export type KnowledgeEntrySummary = {
  id: string;
  organizationId: string;
  knowledgeSpaceId: string;
  /** Absent = connaissance globale de l'organisation, une valeur = spécifique à ce client
   *  (mission Sprint 5.1 §"Knowledge Base"). */
  clientAccountId?: string;
  title: string;
  description?: string;
  category: KnowledgeCategory;
  sourceType: KnowledgeSourceType;
  status: KnowledgeEntryStatus;
  language?: string;
  metadata: Record<string, unknown>;
  tags: KnowledgeTagSummary[];
  documentCount: number;
  activeVersionNumber: number;
  /** V2 Sprint 8 §15/§16 — validation de la version ACTIVE (dénormalisée), absente tant qu'aucun
   *  humain n'a validé explicitement — jamais une confiance héritée ou implicite. */
  validatedByUserId?: string;
  validatedAt?: string;
  /** V2 Sprint 8 §17/§18 — provenance immuable (promotion depuis un ChecklistItem de Tender). */
  sourceTenderId?: string;
  sourceChecklistItemId?: string;
  sourceDocumentId?: string;
  sourceDocumentVersionId?: string;
  promotedByUserId?: string;
  promotedAt?: string;
  createdByUserId: string;
  updatedByUserId?: string;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeChunkSummary = {
  id: string;
  knowledgeDocumentId: string;
  sequence: number;
  content: string;
  characterCount: number;
  pageStart?: number;
  pageEnd?: number;
  sheetName?: string;
  sectionTitle?: string;
  checksum: string;
  createdAt: string;
};

export type KnowledgeDocumentSummary = {
  id: string;
  organizationId: string;
  knowledgeEntryId: string;
  documentId: string;
  versionNumber: number;
  status: KnowledgeDocumentStatus;
  language?: string;
  warnings: readonly string[];
  errorMessage?: string;
  attemptCount: number;
  processedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeDocumentDetail = KnowledgeDocumentSummary & { chunks: KnowledgeChunkSummary[] };

export type KnowledgeEntryVersionSummary = {
  id: string;
  knowledgeEntryId: string;
  versionNumber: number;
  reason?: string;
  snapshot: Record<string, unknown>;
  createdByUserId: string;
  createdAt: string;
  /** V2 Sprint 8 §71/72 — vérité historique de validation PROPRE à cette version. */
  validatedByUserId?: string;
  validatedAt?: string;
};

export type KnowledgeSearchResult = {
  knowledgeEntryId: string;
  title: string;
  category: KnowledgeCategory;
  status: KnowledgeEntryStatus;
  tags: string[];
  matchLocation: string;
  snippet: string;
  knowledgeDocumentId?: string;
  chunkSequence?: number;
  pageStart?: number;
  pageEnd?: number;
  sheetName?: string;
  sectionTitle?: string;
  activeVersionNumber: number;
};

export const KNOWLEDGE_CATEGORY_LABELS: Record<KnowledgeCategory, string> = {
  COMPANY_PRESENTATION: "Présentation de l'entreprise",
  CLIENT_REFERENCE: "Référence client",
  CONSULTANT_PROFILE: "Profil consultant",
  CERTIFICATION: "Certification",
  METHODOLOGY: "Méthodologie",
  SERVICE_OFFER: "Offre de service",
  CASE_STUDY: "Étude de cas",
  SECURITY: "Sécurité",
  GDPR: "RGPD",
  CSR: "RSE",
  ADMINISTRATIVE: "Administratif",
  TECHNICAL_MEMORY: "Mémoire technique",
  RESPONSE_TEMPLATE: "Modèle de réponse",
  COMMERCIAL_DOCUMENT: "Document commercial",
  IMAGE: "Image",
  OTHER: "Autre",
};

export const KNOWLEDGE_STATUS_LABELS: Record<KnowledgeEntryStatus, string> = {
  DRAFT: "Brouillon",
  PROCESSING: "Traitement en cours",
  READY: "Prête",
  PARTIALLY_READY: "Partiellement prête",
  FAILED: "Échec",
  ARCHIVED: "Archivée",
};

export const KNOWLEDGE_DOCUMENT_STATUS_LABELS: Record<KnowledgeDocumentStatus, string> = {
  PENDING: "En attente",
  PROCESSING: "Traitement en cours",
  READY: "Prêt",
  FAILED: "Échec",
};

export function knowledgeStatusBadgeClass(status: KnowledgeEntryStatus): string {
  switch (status) {
    case "READY":
      return "bg-green-100 text-green-800";
    case "PARTIALLY_READY":
      return "bg-amber-100 text-amber-800";
    case "FAILED":
      return "bg-red-100 text-red-800";
    case "ARCHIVED":
      return "bg-neutral-200 text-neutral-700";
    default:
      return "bg-blue-100 text-blue-800";
  }
}

/** Miroir cote UI de ROLE_KNOWLEDGE_PERMISSIONS (knowledge-permission.ts) — sert uniquement a
 *  griser/masquer une action ; la seule autorite reelle reste la revalidation backend. */
const ADMIN_TIER = ["OWNER", "ORGANIZATION_ADMIN", "BID_MANAGER"];
const CONTRIBUTOR_TIER = ["CONTRIBUTOR"];

export function canCreateOrEditKnowledgeEntry(role: string | undefined): boolean {
  return role !== undefined && (ADMIN_TIER.includes(role) || CONTRIBUTOR_TIER.includes(role));
}

export function canManageKnowledgeLifecycle(role: string | undefined): boolean {
  return role !== undefined && (ADMIN_TIER.includes(role) || CONTRIBUTOR_TIER.includes(role));
}

export function canDeleteKnowledgeEntry(role: string | undefined): boolean {
  return role !== undefined && ADMIN_TIER.includes(role);
}

/** Mission V2 Sprint 8 §15/§16/§21 — palier Admin uniquement (même motif que
 *  `canDeleteKnowledgeEntry`), jamais accordée au CONTRIBUTOR. */
export function canValidateKnowledgeEntry(role: string | undefined): boolean {
  return role !== undefined && ADMIN_TIER.includes(role);
}

/** Mission §15/§16 — seule la version ACTIVE d'une entrée READY/PARTIALLY_READY, pas encore
 *  validée, peut être validée (même garde que le domaine backend, dupliquée ici pour l'affichage). */
export function isKnowledgeEntryValidatable(entry: Pick<KnowledgeEntrySummary, "status" | "validatedAt">): boolean {
  return (entry.status === "READY" || entry.status === "PARTIALLY_READY") && !entry.validatedAt;
}

export function formatProvenanceLocation(result: {
  pageStart?: number;
  pageEnd?: number;
  sheetName?: string;
  sectionTitle?: string;
}): string | undefined {
  const location = [
    result.pageStart !== undefined
      ? result.pageEnd !== undefined && result.pageEnd !== result.pageStart
        ? `p.${result.pageStart}-${result.pageEnd}`
        : `p.${result.pageStart}`
      : undefined,
    result.sheetName,
    result.sectionTitle,
  ]
    .filter(Boolean)
    .join(" — ");
  return location.length > 0 ? location : undefined;
}
