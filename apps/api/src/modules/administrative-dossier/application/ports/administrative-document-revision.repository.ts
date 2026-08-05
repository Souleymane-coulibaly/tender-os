import type { AdministrativeDocumentRevision } from "../../domain/administrative-document-revision.entity";

export interface AdministrativeDocumentRevisionRepository {
  create(revision: AdministrativeDocumentRevision): Promise<void>;
  findById(input: { organizationId: string; revisionId: string }): Promise<AdministrativeDocumentRevision | null>;
  listByDocument(input: { organizationId: string; administrativeDocumentId: string }): Promise<readonly AdministrativeDocumentRevision[]>;
  save(revision: AdministrativeDocumentRevision): Promise<void>;
}

export const ADMINISTRATIVE_DOCUMENT_REVISION_REPOSITORY = Symbol("ADMINISTRATIVE_DOCUMENT_REVISION_REPOSITORY");
