import type { RequestedDocument } from "../../domain/requested-document.entity";

export interface RequestedDocumentRepository {
  findById(input: {
    organizationId: string;
    tenderId: string;
    documentId: string;
  }): Promise<RequestedDocument | null>;
  listByTender(input: { organizationId: string; tenderId: string }): Promise<RequestedDocument[]>;
  save(document: RequestedDocument): Promise<void>;
  delete(input: { organizationId: string; tenderId: string; documentId: string }): Promise<void>;
}

export const REQUESTED_DOCUMENT_REPOSITORY = Symbol("REQUESTED_DOCUMENT_REPOSITORY");
