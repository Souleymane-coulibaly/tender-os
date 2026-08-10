export type DceSummary = {
  id: string;
  organizationId: string;
  tenderId: string;
  status: "DRAFT" | "IMPORTED";
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type DceDocumentCategory = "ADMINISTRATIVE" | "TECHNICAL" | "FINANCIAL" | "DRAWINGS" | "OTHER";

export type DceDocumentProcessingStatus =
  | "IMPORTED"
  | "READY_FOR_OCR"
  | "PENDING_TEXT_INSPECTION"
  | "READY_FOR_NATIVE_EXTRACTION"
  | "NOT_PROCESSABLE"
  | "READY_FOR_ANALYSIS"
  | "READY_FOR_ANALYSIS_WITH_WARNINGS";

export type DceDocumentSummary = {
  dceId: string;
  documentId: string;
  originalFilename: string;
  sanitizedFilename: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  checksum: string;
  /** V2 Sprint 13 (Chiffrage) — déjà présent côté API (`DceDocumentSummary`), simplement absent de
   *  ce type frontend jusqu'ici (aucun consommateur n'en avait besoin) : requis pour créer un
   *  chiffrage sur une version précise du document sans jamais dépendre implicitement de
   *  `document.currentVersion` au moment de l'extraction. */
  currentVersionId: string;
  currentVersionNumber: number;
  category: DceDocumentCategory;
  processingStatus: DceDocumentProcessingStatus;
  createdByUserId: string;
  createdAt: string;
};

/** Mission Sprint 8A.2 — statut d'extraction affiché tel quel côté écran Tender (jamais un second
 *  calcul du statut, `processingStatus` reflète déjà en temps réel l'avancement de l'extraction,
 *  mis à jour par ProcessDocumentExtractionUseCase en miroir de DocumentExtraction.status). */
export const DCE_DOCUMENT_PROCESSING_STATUS_LABELS: Record<DceDocumentProcessingStatus, string> = {
  IMPORTED: "Importé — extraction en attente",
  READY_FOR_OCR: "Extraction (OCR) en cours",
  PENDING_TEXT_INSPECTION: "Extraction en cours",
  READY_FOR_NATIVE_EXTRACTION: "Extraction en cours",
  NOT_PROCESSABLE: "Format non traitable",
  READY_FOR_ANALYSIS: "Prêt pour analyse",
  READY_FOR_ANALYSIS_WITH_WARNINGS: "Prêt pour analyse (avec réserves)",
};

/** Un document ne peut être soumis à l'analyse IA (StartDocumentAnalysisUseCase) qu'une fois son
 *  extraction terminée avec succès — jamais avant, sous peine d'un échec backend explicite
 *  (ExtractionNotReadyForAnalysisError) déjà géré, mais qu'il vaut mieux ne jamais déclencher. */
export function isReadyForAnalysis(status: DceDocumentProcessingStatus): boolean {
  return status === "READY_FOR_ANALYSIS" || status === "READY_FOR_ANALYSIS_WITH_WARNINGS";
}

export type DceImportRejection = { originalFilename: string; reason: string };

export type DceImportResult = {
  accepted: DceDocumentSummary[];
  rejected: DceImportRejection[];
};

/** Mission Sprint 8A.2 (correction bug #3 "import ZIP lourd échoue ou bloque") — l'import ZIP est
 *  désormais asynchrone : `POST .../dce/import-zip` répond immédiatement avec ce job à l'état
 *  CREATED, à sonder via `GET .../dce/import-jobs/:jobId` jusqu'à un statut terminal. */
export type DceImportJobStatus =
  | "CREATED"
  | "EXTRACTING"
  | "IMPORTING"
  | "READY"
  | "PARTIALLY_READY"
  | "FAILED"
  | "CANCELLED";

export type DceImportJobSummary = {
  id: string;
  organizationId: string;
  tenderId: string;
  status: DceImportJobStatus;
  originalFilename: string;
  sizeBytes: number;
  totalFiles?: number;
  acceptedCount?: number;
  rejectedCount?: number;
  result?: DceImportResult;
  errorMessage?: string;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

export const DCE_IMPORT_JOB_STATUS_LABELS: Record<DceImportJobStatus, string> = {
  CREATED: "En file d'attente",
  EXTRACTING: "Extraction de l'archive en cours",
  IMPORTING: "Import des fichiers en cours",
  READY: "Import terminé",
  PARTIALLY_READY: "Import terminé (avec fichiers refusés)",
  FAILED: "Échec de l'import",
  CANCELLED: "Import annulé",
};

export function isTerminalDceImportJobStatus(status: DceImportJobStatus): boolean {
  return status === "READY" || status === "PARTIALLY_READY" || status === "FAILED" || status === "CANCELLED";
}

/** Miroir cote UI de ROLE_DCE_PERMISSIONS (dce-permission.ts) — sert uniquement a griser/masquer
 *  une action ; la seule autorite reelle reste la revalidation backend (meme motif que
 *  documents-types.ts/AUDIT-005). */
// Mission Sprint 8A.2 (audit Cockpit Bid Manager) — OWNER manquait ici (miroir jamais mis à jour
// après le correctif backend OWNER de dce-permission.ts), rendant "Initialiser le DCE"/import/
// remplacement invisibles pour un propriétaire d'organisation bien qu'autorisé côté API.
const ADMIN_TIER = ["OWNER", "ORGANIZATION_ADMIN", "BID_MANAGER"];
const CONTRIBUTOR_TIER = ["CONTRIBUTOR"];

export function canImportOrReplaceDceDocument(role: string | undefined): boolean {
  return role !== undefined && (ADMIN_TIER.includes(role) || CONTRIBUTOR_TIER.includes(role));
}

export function canDeleteDceDocument(role: string | undefined): boolean {
  return role !== undefined && ADMIN_TIER.includes(role);
}

export function formatDceFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} o`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} Ko`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} Mo`;
}
