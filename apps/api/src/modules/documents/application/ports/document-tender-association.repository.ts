import type { DocumentTenderAssociation } from "../../domain/document-tender-association.entity";

export interface DocumentTenderAssociationRepository {
  exists(input: { organizationId: string; documentId: string; tenderId: string }): Promise<boolean>;
  create(association: DocumentTenderAssociation): Promise<void>;
  delete(input: { organizationId: string; documentId: string; tenderId: string }): Promise<void>;
}

export const DOCUMENT_TENDER_ASSOCIATION_REPOSITORY = Symbol("DOCUMENT_TENDER_ASSOCIATION_REPOSITORY");
