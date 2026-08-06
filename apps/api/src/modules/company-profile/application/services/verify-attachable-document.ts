import { GetDocumentUseCase } from "../../../documents";
import { DocumentNotUsableForCompanyProfileError } from "../../domain/errors";

export type AttachableDocumentReference = Readonly<{
  documentId: string;
}>;

/**
 * Point d'entrée UNIQUE pour vérifier qu'un `documentId` fourni est réellement exploitable avant
 * association à une entreprise candidate — copie locale du motif déjà établi dans
 * `administrative-dossier`/`submission` (mission "aucun import profond vers l'infrastructure d'un
 * autre bounded context"), délègue ENTIÈREMENT au port public déjà RBAC/tenant-gated du module
 * Documents.
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
    throw new DocumentNotUsableForCompanyProfileError();
  }
  return { documentId: document.id };
}
