import { DocumentNotUsableForAdministrativeDocumentError } from "../../domain/errors";
import { GetDocumentUseCase } from "../../../documents";

export type AttachableDocumentReference = Readonly<{
  documentId: string;
  documentVersionId: string;
  documentChecksum: string;
  documentFileName: string;
  documentMimeType: string;
}>;

/**
 * Correctif audit Codex P1-003 — même motif que `verifyAttachableDocument` du module Livrables
 * (copie propre à CE module plutôt qu'un import profond inter-module, mission "aucun import
 * profond vers l'infrastructure d'un autre bounded context") : point d'entrée UNIQUE pour vérifier
 * qu'un `documentId` fourni est réellement exploitable avant toute association, en délégant
 * ENTIÈREMENT au port public déjà RBAC/tenant-gated du module Documents.
 */
export async function verifyAttachableDocument(
  getDocumentUseCase: GetDocumentUseCase,
  input: { organizationId: string; actorId: string; actorRole: string; documentId: string },
): Promise<AttachableDocumentReference> {
  const document = await getDocumentUseCase.execute({
    organizationId: input.organizationId,
    documentId: input.documentId,
    actorId: input.actorId,
    actorRole: input.actorRole,
  });
  if (!document.currentVersion) {
    throw new DocumentNotUsableForAdministrativeDocumentError("the document has no uploaded version yet");
  }
  return {
    documentId: document.id,
    documentVersionId: document.currentVersion.id,
    documentChecksum: document.currentVersion.checksum,
    documentFileName: document.currentVersion.sanitizedFilename,
    documentMimeType: document.currentVersion.mimeType,
  };
}
