import type { Dce } from "../domain/dce.aggregate";

export type DceSummary = {
  id: string;
  organizationId: string;
  tenderId: string;
  status: string;
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
export type DceDocumentSummary = {
  dceId: string;
  documentId: string;
  originalFilename: string;
  sanitizedFilename: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  checksum: string;
  currentVersionNumber: number;
  category: string;
  processingStatus: string;
  createdByUserId: string;
  createdAt: string;
};
