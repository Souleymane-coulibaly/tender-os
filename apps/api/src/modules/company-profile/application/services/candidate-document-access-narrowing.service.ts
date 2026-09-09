import { Inject, Injectable } from "@nestjs/common";
import { roleHasCandidatePermission, CandidatePermission } from "../../../candidate-company/domain/candidate-permission";
import type { DocumentAccessNarrowingPolicy } from "../../../documents/application/ports/document-access-narrowing";
import { DocumentAccessNarrowedError } from "../../../documents/domain/errors";
import { isBankingDocumentCategory } from "../../domain/candidate-document-category";
import {
  DOCUMENT_CANDIDATE_COMPANY_ASSOCIATION_REPOSITORY,
  type DocumentCandidateCompanyAssociationRepository,
} from "../ports/company-satellite.repository";

/**
 * Checkpoint TENDEROS-2.1-CCV2-D — ferme le contournement bancaire au niveau du MOTEUR documentaire.
 *
 * Sans ce rétrécissement, `GET /documents/:id/download` suffisait à récupérer un RIB : la permission
 * générique `document:download` est accordée à TOUS les rôles d'organisation, `READ_ONLY` et
 * `EXTERNAL_CONSULTANT` compris, et `assertDocumentClientAccess` ne restreint rien pour un document
 * sans association de Tender. La frontière posée en CCV2-C.1 était donc contournable dès qu'un
 * justificatif bancaire existait sous forme de fichier.
 *
 * Règle appliquée : si un Document est rattaché à une entreprise candidate sous une catégorie
 * BANCAIRE, sa lecture exige `candidate:read_banking`. Tout autre document reste régi exactement
 * comme avant — aucun durcissement collatéral.
 *
 * L'évaluation porte sur le SEUL rôle d'organisation de l'acteur : elle n'interroge aucune autre
 * ressource et ne peut donc rien révéler d'un autre tenant.
 */
@Injectable()
export class CandidateDocumentAccessNarrowingService implements DocumentAccessNarrowingPolicy {
  constructor(
    @Inject(DOCUMENT_CANDIDATE_COMPANY_ASSOCIATION_REPOSITORY) private readonly repository: DocumentCandidateCompanyAssociationRepository,
  ) {}

  /**
   * Checkpoint TENDEROS-2.1-CCV2-I.3 — filtrage EN LOT pour les listes.
   *
   * UNE seule requête quelle que soit la taille de la page : on ne récupère que les associations
   * BANCAIRES parmi les documents demandés, puis on retire ces documents si l'acteur n'a pas la
   * permission bancaire. Un acteur qui l'a ne subit aucun filtrage — et l'on évite alors même la
   * requête, puisque son résultat ne pourrait rien changer.
   */
  async filterReadable(input: { organizationId: string; documentIds: readonly string[]; actorRole: string }): Promise<readonly string[]> {
    if (input.documentIds.length === 0 || roleHasCandidatePermission(input.actorRole, CandidatePermission.ReadBanking)) {
      return input.documentIds;
    }
    const bankingDocumentIds = await this.repository.findBankingDocumentIds({
      organizationId: input.organizationId,
      documentIds: input.documentIds,
    });
    const hidden = new Set(bankingDocumentIds);
    return input.documentIds.filter((documentId) => !hidden.has(documentId));
  }

  async assertReadable(input: { organizationId: string; documentId: string; actorRole: string }): Promise<void> {
    const associations = await this.repository.findAssociationsByDocument(input);
    const isBanking = associations.some((association) => isBankingDocumentCategory(association.category));
    if (!isBanking) {
      return;
    }
    if (!roleHasCandidatePermission(input.actorRole, CandidatePermission.ReadBanking)) {
      throw new DocumentAccessNarrowedError("Reading this banking document requires the candidate banking permission.");
    }
  }
}
