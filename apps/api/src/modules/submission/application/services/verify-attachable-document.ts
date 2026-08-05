import { GetDocumentUseCase } from "../../../documents";
import { DocumentNotUsableForSubmissionProofError } from "../../domain/errors";

export type AttachableDocumentReference = Readonly<{
  documentId: string;
  documentVersionId: string;
  documentChecksum: string;
  documentFileName: string;
  documentMimeType: string;
}>;

/**
 * Sprint 9 — copie locale à CE module (même motif que `administrative-dossier`/`deliverables` :
 * "aucun import profond vers l'infrastructure d'un autre bounded context") : point d'entrée UNIQUE
 * pour vérifier qu'un `documentId` fourni comme preuve de dépôt est réellement exploitable, en
 * délégant ENTIÈREMENT au port public déjà RBAC/tenant-gated du module Documents.
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
    throw new DocumentNotUsableForSubmissionProofError("the document has no uploaded version yet");
  }
  return {
    documentId: document.id,
    documentVersionId: document.currentVersion.id,
    documentChecksum: document.currentVersion.checksum,
    documentFileName: document.currentVersion.sanitizedFilename,
    documentMimeType: document.currentVersion.mimeType,
  };
}
