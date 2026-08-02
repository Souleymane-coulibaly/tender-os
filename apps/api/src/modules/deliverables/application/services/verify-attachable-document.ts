import { DocumentNotUsableForDeliverableError } from "../../domain/errors";
import { GetDocumentUseCase } from "../../../documents";

export type AttachableDocumentReference = Readonly<{
  documentId: string;
  documentVersionId: string;
  documentChecksum: string;
  documentFileName: string;
  documentMimeType: string;
}>;

/**
 * Correctif audit Codex P1-003 — point d'entrée UNIQUE pour vérifier qu'un `documentId` fourni par
 * un acteur pour une checklist/annexe est réellement exploitable, avant toute association :
 * existe, appartient à la bonne organisation, est accessible à l'acteur (tenant/client via
 * `GetDocumentUseCase`, qui vérifie en interne que l'acteur a accès à au moins un Tender associé —
 * jamais un accès non vérifié), et possède au moins une version dont la référence peut être figée.
 * Jamais un second accès direct à Prisma/documents ici — délègue ENTIÈREMENT au port public déjà
 * RBAC/tenant-gated du module Documents (même motif que `GetPricingEstimateUseCase` pour Pricing).
 * Une erreur de vérification (document inexistant, autre organisation, supprimé, inaccessible)
 * n'est JAMAIS distinguée dans le message renvoyé à l'acteur (mission — "ne jamais révéler
 * l'existence d'un document étranger") : `GetDocumentUseCase` lève déjà `DocumentNotFoundError`
 * de façon uniforme dans tous ces cas, jamais un 403 qui confirmerait l'existence.
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
    throw new DocumentNotUsableForDeliverableError("the document has no uploaded version yet");
  }
  return {
    documentId: document.id,
    documentVersionId: document.currentVersion.id,
    documentChecksum: document.currentVersion.checksum,
    documentFileName: document.currentVersion.sanitizedFilename,
    documentMimeType: document.currentVersion.mimeType,
  };
}
