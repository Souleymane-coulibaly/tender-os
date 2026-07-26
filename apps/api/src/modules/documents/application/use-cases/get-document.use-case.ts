import { Inject, Injectable } from "@nestjs/common";
import { DocumentNotFoundError } from "../../domain/errors";
import { DocumentPermission } from "../../domain/document-permission";
import { assertHasDocumentPermission } from "../policies/document-authorization.policy";
import { DOCUMENT_REPOSITORY, type DocumentRepository } from "../ports/document.repository";
import { DOCUMENT_VERSION_REPOSITORY, type DocumentVersionRepository } from "../ports/document-version.repository";
import { toDocumentSummary, type DocumentSummary } from "../dtos";

export type GetDocumentQuery = Readonly<{ organizationId: string; documentId: string; actorRole: string }>;

@Injectable()
export class GetDocumentUseCase {
  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly documentRepository: DocumentRepository,
    @Inject(DOCUMENT_VERSION_REPOSITORY) private readonly versionRepository: DocumentVersionRepository,
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
