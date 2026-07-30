import { Inject, Injectable } from "@nestjs/common";
import { GetTenderUseCase } from "../../../tenders";
import { DocumentNotFoundError, DocumentVersionNotFoundError } from "../../domain/errors";
import { DocumentPermission } from "../../domain/document-permission";
import { assertHasDocumentPermission } from "../policies/document-authorization.policy";
import { assertDocumentClientAccess } from "../policies/document-client-access.helper";
import { DOCUMENT_TENDER_ASSOCIATION_REPOSITORY, type DocumentTenderAssociationRepository } from "../ports/document-tender-association.repository";
import { DOCUMENT_REPOSITORY, type DocumentRepository } from "../ports/document.repository";
import { DOCUMENT_VERSION_REPOSITORY, type DocumentVersionRepository } from "../ports/document-version.repository";
import { STORAGE_PROVIDER, type DocumentDownload, type StorageProvider } from "../ports/storage-provider";

export type DownloadDocumentVersionQuery = Readonly<{
  organizationId: string;
  documentId: string;
  /** Version précise à télécharger — par défaut, la version courante du document. */
  versionId?: string | undefined;
  actorRole: string;
  actorId?: string | undefined;
}>;

/**
 * Ne génère jamais d'accès (flux ou URL signée) sans avoir d'abord vérifié organisation,
 * existence du document et de la version, et permission — dans cet ordre (conception §22).
 */
@Injectable()
export class DownloadDocumentVersionUseCase {
  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly documentRepository: DocumentRepository,
    @Inject(DOCUMENT_VERSION_REPOSITORY) private readonly versionRepository: DocumentVersionRepository,
    @Inject(STORAGE_PROVIDER) private readonly storageProvider: StorageProvider,
    @Inject(DOCUMENT_TENDER_ASSOCIATION_REPOSITORY) private readonly associationRepository: DocumentTenderAssociationRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
  ) {}

  async execute(query: DownloadDocumentVersionQuery): Promise<DocumentDownload> {
    assertHasDocumentPermission(query.actorRole, DocumentPermission.Download);

    const document = await this.documentRepository.findById({
      organizationId: query.organizationId,
      documentId: query.documentId,
    });
    if (!document) {
      throw new DocumentNotFoundError();
    }

    if (query.actorId) {
      await assertDocumentClientAccess(this.associationRepository, this.getTenderUseCase, { ...query, actorId: query.actorId });
    }

    const versionId = query.versionId ?? document.currentVersionId;
    if (!versionId) {
      throw new DocumentVersionNotFoundError();
    }

    const version = await this.versionRepository.findById({
      organizationId: query.organizationId,
      documentId: query.documentId,
      versionId,
    });
    if (!version) {
      throw new DocumentVersionNotFoundError();
    }

    if (this.storageProvider.generateSignedUrl) {
      const url = await this.storageProvider.generateSignedUrl(version.storageKey, 60);
      return { kind: "redirect", url, expiresAt: new Date(Date.now() + 60_000) };
    }

    const stream = await this.storageProvider.openReadStream(version.storageKey);
    return {
      kind: "stream",
      stream,
      contentType: version.mimeType,
      filename: version.sanitizedFilename,
      sizeBytes: version.sizeBytes,
    };
  }
}
