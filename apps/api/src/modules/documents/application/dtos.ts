import type { Document } from "../domain/document.aggregate";
import type { DocumentTenderAssociation } from "../domain/document-tender-association.entity";
import type { DocumentVersion } from "../domain/document-version.entity";

/** Résumé d'une version — jamais `storageKey` (conception §M : ne jamais exposer la clé de
 *  stockage, un chemin, ou une configuration de stockage dans une réponse API). */
export type DocumentVersionSummary = {
  id: string;
  documentId: string;
  versionNumber: number;
  originalFilename: string;
  sanitizedFilename: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  checksum: string;
  uploadedByUserId: string;
  createdAt: string;
};

export function toDocumentVersionSummary(version: DocumentVersion): DocumentVersionSummary {
  return {
    id: version.id,
    documentId: version.documentId,
    versionNumber: version.versionNumber,
    originalFilename: version.originalFilename,
    sanitizedFilename: version.sanitizedFilename,
    mimeType: version.mimeType,
    extension: version.extension,
    sizeBytes: version.sizeBytes,
    checksum: version.checksum,
    uploadedByUserId: version.uploadedByUserId,
    createdAt: version.createdAt.toISOString(),
  };
}

export type DocumentSummary = {
  id: string;
  organizationId: string;
  title: string;
  description?: string | undefined;
  origin: string;
  domain: string;
  category?: string | undefined;
  status: string;
  currentVersionNumber: number;
  currentVersion?: DocumentVersionSummary | undefined;
  createdByUserId: string;
  updatedByUserId?: string | undefined;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | undefined;
};

/** `currentVersion` est facultatif : les use cases de liste peuvent le composer en lot
 *  (une requête groupée) plutôt qu'un par document, exactement comme pour Tenders. */
export function toDocumentSummary(document: Document, currentVersion?: DocumentVersion): DocumentSummary {
  return {
    id: document.id.value,
    organizationId: document.organizationId,
    title: document.title,
    description: document.description,
    origin: document.origin,
    domain: document.domain,
    category: document.category,
    status: document.status,
    currentVersionNumber: document.currentVersionNumber,
    currentVersion: currentVersion ? toDocumentVersionSummary(currentVersion) : undefined,
    createdByUserId: document.createdByUserId,
    updatedByUserId: document.updatedByUserId,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
    archivedAt: document.archivedAt?.toISOString(),
  };
}

export type DocumentTenderAssociationSummary = {
  documentId: string;
  tenderId: string;
  createdByUserId: string;
  createdAt: string;
};

export function toDocumentTenderAssociationSummary(
  association: DocumentTenderAssociation,
): DocumentTenderAssociationSummary {
  return {
    documentId: association.documentId,
    tenderId: association.tenderId,
    createdByUserId: association.createdByUserId,
    createdAt: association.createdAt.toISOString(),
  };
}
