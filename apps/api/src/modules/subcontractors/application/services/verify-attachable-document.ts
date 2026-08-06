import { GetDocumentUseCase } from "../../../documents";
import { DocumentNotUsableForSubcontractorProfileError } from "../../domain/errors";

export type AttachableDocumentReference = Readonly<{ documentId: string }>;

/** Copie locale du motif déjà établi dans `company-profile`/`administrative-dossier` (mission
 *  "aucun import profond vers l'infrastructure d'un autre bounded context"). */
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
    throw new DocumentNotUsableForSubcontractorProfileError();
  }
  return { documentId: document.id };
}
