import { Inject, Injectable, Optional } from "@nestjs/common";
import { GetTenderUseCase } from "../../../tenders";
import { DocumentNotFoundError } from "../../domain/errors";
import { DocumentPermission } from "../../domain/document-permission";
import { assertHasDocumentPermission } from "../policies/document-authorization.policy";
import { assertDocumentClientAccess } from "../policies/document-client-access.helper";
import { DOCUMENT_ACCESS_NARROWING, type DocumentAccessNarrowingPolicy } from "../ports/document-access-narrowing";
import { DOCUMENT_TENDER_ASSOCIATION_REPOSITORY, type DocumentTenderAssociationRepository } from "../ports/document-tender-association.repository";
import { DOCUMENT_REPOSITORY, type DocumentRepository } from "../ports/document.repository";
import { DOCUMENT_VERSION_REPOSITORY, type DocumentVersionRepository } from "../ports/document-version.repository";
import { toDocumentSummary, type DocumentSummary } from "../dtos";

export type GetDocumentQuery = Readonly<{ organizationId: string; documentId: string; actorRole: string; actorId?: string | undefined }>;

@Injectable()
export class GetDocumentUseCase {
  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly documentRepository: DocumentRepository,
    @Inject(DOCUMENT_VERSION_REPOSITORY) private readonly versionRepository: DocumentVersionRepository,
    @Inject(DOCUMENT_TENDER_ASSOCIATION_REPOSITORY) private readonly associationRepository: DocumentTenderAssociationRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
    @Optional() @Inject(DOCUMENT_ACCESS_NARROWING) private readonly accessNarrowing?: DocumentAccessNarrowingPolicy,
  ) {}

  async execute(query: GetDocumentQuery): Promise<DocumentSummary> {
    assertHasDocumentPermission(query.actorRole, DocumentPermission.Read);

    const document = await this.documentRepository.findById({
      organizationId: query.organizationId,
      documentId: query.documentId,
    });
    if (!document) {
      throw new DocumentNotFoundError();
    }

    if (query.actorId) {
      await assertDocumentClientAccess(this.associationRepository, this.getTenderUseCase, { ...query, actorId: query.actorId });

    // CCV2-D — rétrécissement métier optionnel (RIB candidate : exige `candidate:read_banking`).
    // Placé APRÈS la résolution du document : un acteur sans droit ne peut donc pas distinguer
    // « document inexistant » de « document bancaire protégé » par un timing différent.
    await this.accessNarrowing?.assertReadable({ organizationId: query.organizationId, documentId: query.documentId, actorRole: query.actorRole });
    }

    const currentVersion = document.currentVersionId
      ? await this.versionRepository.findById({
          organizationId: query.organizationId,
          documentId: query.documentId,
          versionId: document.currentVersionId,
        })
      : null;

    return toDocumentSummary(document, currentVersion ?? undefined);
  }
}
