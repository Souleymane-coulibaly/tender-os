import type { DocumentSummary, DocumentTenderAssociationSummary, DocumentVersionSummary } from "../../application/dtos";

export type PageResponse<T> = Readonly<{
  items: readonly T[];
  pageInfo: Readonly<{ hasNextPage: boolean; nextCursor: string | null }>;
}>;

export function presentPage<T>(items: readonly T[], nextCursor: string | null): PageResponse<T> {
  return { items, pageInfo: { hasNextPage: nextCursor !== null, nextCursor } };
}

// Passe-plat volontaire : DocumentSummary/DocumentVersionSummary n'exposent déjà jamais
// storageKey ni aucune information de stockage (conception §M, application/dtos.ts).
export function presentDocument(document: DocumentSummary): DocumentSummary {
  return { ...document };
}
export function presentDocumentVersion(version: DocumentVersionSummary): DocumentVersionSummary {
  return { ...version };
}
export function presentDocumentTenderAssociation(
  association: DocumentTenderAssociationSummary,
): DocumentTenderAssociationSummary {
  return { ...association };
}
