import { Inject, Injectable } from "@nestjs/common";
import { DocumentNotFoundError } from "../../domain/errors";
import { DocumentPermission } from "../../domain/document-permission";
import { assertHasDocumentPermission } from "../policies/document-authorization.policy";
import { toDocumentVersionSummary, type DocumentVersionSummary } from "../dtos";
import { DOCUMENT_REPOSITORY, type DocumentRepository } from "../ports/document.repository";
import { DOCUMENT_VERSION_REPOSITORY, type DocumentVersionRepository } from "../ports/document-version.repository";

export type ListDocumentVersionsQuery = Readonly<{ organizationId: string; documentId: string; actorRole: string }>;

@Injectable()
export class ListDocumentVersionsUseCase {
  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly documentRepository: DocumentRepository,
    @Inject(DOCUMENT_VERSION_REPOSITORY) private readonly versionRepository: DocumentVersionRepository,
  ) {}

  async execute(query: ListDocumentVersionsQuery): Promise<DocumentVersionSummary[]> {
    assertHasDocumentPermission(query.actorRole, DocumentPermission.Read);

    const document = await this.documentRepository.findById({
      organizationId: query.organizationId,
      documentId: query.documentId,
    });
    if (!document) {
      throw new DocumentNotFoundError();
    }

    const versions = await this.versionRepository.listByDocument({
      organizationId: query.organizationId,
      documentId: query.documentId,
    });

    return versions.map(toDocumentVersionSummary);
  }
}
