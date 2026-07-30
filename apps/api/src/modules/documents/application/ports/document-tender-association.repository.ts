import type { DocumentTenderAssociation } from "../../domain/document-tender-association.entity";

export interface DocumentTenderAssociationRepository {
  exists(input: { organizationId: string; documentId: string; tenderId: string }): Promise<boolean>;
  create(association: DocumentTenderAssociation): Promise<void>;
  delete(input: { organizationId: string; documentId: string; tenderId: string }): Promise<void>;
  /** Mission Sprint 5.1 §"Documents" — un document attaché hérite du contexte client de son
   *  Tender : utilisé pour vérifier l'accès client avant lecture/téléchargement/mutation d'un
   *  document référencé directement par son id (hors route imbriquée sous /tenders/:tenderId). */
  listTenderIdsByDocument(input: { organizationId: string; documentId: string }): Promise<readonly string[]>;
}

export const DOCUMENT_TENDER_ASSOCIATION_REPOSITORY = Symbol("DOCUMENT_TENDER_ASSOCIATION_REPOSITORY");
