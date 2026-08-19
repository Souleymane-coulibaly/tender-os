import type { DceImportJob } from "../domain/dce-import-job.aggregate";
import type { Dce } from "../domain/dce.aggregate";
import type { ImportDceFilesResult } from "./use-cases/import-dce-files.use-case";

export type DceSummary = {
  id: string;
  organizationId: string;
  tenderId: string;
  status: string;
  /** Checkpoint 2.1-P2.1-FIX-A — révision monotone du contenu sémantique du DCE (voir
   *  `Dce.revision`), exposée en lecture pour permettre à un consommateur de comparer une
   *  révision figée (ex. `TenderAnalysisSummary.dceRevision`) à la valeur courante. */
  revision: number;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};

export function toDceSummary(dce: Dce): DceSummary {
  return {
    id: dce.id.value,
    organizationId: dce.organizationId,
    tenderId: dce.tenderId,
    status: dce.status,
    revision: dce.revision,
    createdByUserId: dce.createdByUserId,
    createdAt: dce.createdAt.toISOString(),
    updatedAt: dce.updatedAt.toISOString(),
  };
}

/**
 * Vue de lecture enrichie d'un fichier du DCE — jamais `storageKey` (même règle que Documents,
 * conception §M). Produite directement par une jointure côté repository DCE (dceDocuments +
 * documents + document_versions), jamais en rappelant les use cases de Documents un par un
 * (évite le N+1 — voir décision d'architecture "lecture hybride" du rapport final).
 */
export type DceImportJobSummary = {
  id: string;
  organizationId: string;
  tenderId: string;
  status: string;
  originalFilename: string;
  sizeBytes: number;
  totalFiles?: number | undefined;
  acceptedCount?: number | undefined;
  rejectedCount?: number | undefined;
  result?: ImportDceFilesResult | undefined;
  errorMessage?: string | undefined;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | undefined;
};

export function toDceImportJobSummary(job: DceImportJob): DceImportJobSummary {
  return {
    id: job.id,
    organizationId: job.organizationId,
    tenderId: job.tenderId,
    status: job.status,
    originalFilename: job.originalFilename,
    sizeBytes: job.sizeBytes,
    totalFiles: job.totalFiles,
    acceptedCount: job.acceptedCount,
    rejectedCount: job.rejectedCount,
    result: job.result,
    errorMessage: job.errorMessage,
    createdByUserId: job.createdByUserId,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    completedAt: job.completedAt?.toISOString(),
  };
}

export type DceDocumentSummary = {
  dceId: string;
  documentId: string;
  originalFilename: string;
  sanitizedFilename: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  checksum: string;
  /// V2 Sprint 4 (audit Codex P1-004) — identifiant stable de la version actuelle, distinct de
  /// `currentVersionNumber` (un entier, jamais une clé étrangère utilisable ailleurs).
  currentVersionId: string;
  currentVersionNumber: number;
  category: string;
  processingStatus: string;
  createdByUserId: string;
  createdAt: string;
};
