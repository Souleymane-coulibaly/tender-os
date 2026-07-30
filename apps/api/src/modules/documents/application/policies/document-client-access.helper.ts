import type { GetTenderUseCase } from "../../../tenders";
import { DocumentNotFoundError } from "../../domain/errors";
import type { DocumentTenderAssociationRepository } from "../ports/document-tender-association.repository";

/**
 * Mission Sprint 5.1 §"Documents" — "un document attaché à un Tender hérite du contexte client du
 * Tender". Un document SANS aucune association de Tender reste un document d'organisation
 * classique (aucune restriction client supplémentaire, régi uniquement par le RBAC Documents
 * existant). Un document associé à au moins un Tender exige que l'acteur ait accès à AU MOINS UN
 * des Tenders associés (rare en pratique qu'un même document soit rattaché à plusieurs Tenders de
 * clients différents, mais jamais exclu par le modèle actuel) — jamais un accès direct par id qui
 * contournerait la policy centralisée déjà appliquée aux routes imbriquées sous /tenders/:tenderId
 * (voir `list-tender-documents.use-case.ts`, `attach-document-to-tender.use-case.ts`).
 *
 * Ne révèle jamais LEQUEL des Tenders associés a été refusé (404/403 distincts selon le cas) —
 * uniquement `DocumentNotFoundError`, pour ne jamais laisser fuiter l'existence d'un Tender/client
 * auquel l'acteur n'a pas accès via un document qu'il a par ailleurs le droit de voir dans la liste
 * organisationnelle.
 */
export async function assertDocumentClientAccess(
  associationRepository: DocumentTenderAssociationRepository,
  getTenderUseCase: GetTenderUseCase,
  input: { organizationId: string; documentId: string; actorId: string; actorRole: string },
): Promise<void> {
  const tenderIds = await associationRepository.listTenderIdsByDocument(input);
  if (tenderIds.length === 0) {
    return;
  }

  for (const tenderId of tenderIds) {
    try {
      await getTenderUseCase.execute({
        organizationId: input.organizationId,
        tenderId,
        actorRole: input.actorRole,
        actorId: input.actorId,
      });
      return;
    } catch {
      // Essaie le Tender associé suivant — voir le commentaire de tête pour le motif.
    }
  }

  throw new DocumentNotFoundError();
}
