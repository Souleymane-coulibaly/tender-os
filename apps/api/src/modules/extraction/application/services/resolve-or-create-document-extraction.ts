import { DocumentExtraction } from "../../domain/document-extraction.aggregate";
import type { DocumentExtractionRepository } from "../ports/document-extraction.repository";

/**
 * Création idempotente d'un `DocumentExtraction` (mission Sprint 3 §17 "un second appel pour un
 * document déjà suivi ne recrée jamais un DocumentExtraction") — logique partagée entre
 * `StartDocumentExtractionUseCase` (déclenchement RBAC-gated par un acteur HTTP) et
 * `AutoTriggerDocumentExtractionUseCase` (déclenchement système, en continuation d'une action déjà
 * autorisée en amont — import DCE, attachement Tender) : les deux appelants ont déjà validé
 * l'existence du lien DceDocument avant d'appeler cette fonction, jamais dupliquée ici.
 */
export async function resolveOrCreateDocumentExtraction(input: {
  extractionRepository: DocumentExtractionRepository;
  organizationId: string;
  dceId: string;
  documentId: string;
  occurredAt: Date;
}): Promise<DocumentExtraction> {
  return input.extractionRepository.runExclusiveShort({
    documentId: input.documentId,
    fn: async (context) => {
      const existing = await context.findByDocumentId({
        organizationId: input.organizationId,
        documentId: input.documentId,
      });
      if (existing) {
        return existing;
      }
      const created = DocumentExtraction.create({
        documentId: input.documentId,
        dceId: input.dceId,
        organizationId: input.organizationId,
        occurredAt: input.occurredAt,
      });
      await context.save(created);
      return created;
    },
  });
}
