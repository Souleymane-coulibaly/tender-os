import { Inject, Injectable } from "@nestjs/common";
import type { Readable } from "node:stream";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { DOCUMENT_VERSION_REPOSITORY, STORAGE_PROVIDER, type DocumentVersionRepository, type StorageProvider } from "../../../documents";
import { GetTenderUseCase } from "../../../tenders";
import { ArtifactNotReadyError, GeneratedDocumentNotFoundError, GeneratedDocumentRevisionNotFoundError } from "../../domain/errors";
import { assertDocumentGenerationAccess } from "../policies/document-generation-authorization.policy";
import { GENERATED_DOCUMENT_REPOSITORY, type GeneratedDocumentRepository } from "../ports/generated-document.repository";

export type DownloadGeneratedDocumentRevisionQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; revisionId: string }>;

export type GeneratedDocumentRevisionDownload = Readonly<{ stream: Readable; contentType: string; filename: string; sizeBytes: number }>;

/**
 * Mission route conceptuelle `GET /document-revisions/:id/download` — jamais une URL publique
 * permanente : le fichier est TOUJOURS diffusé depuis le stockage privé après vérification complète
 * RBAC/tenant/client (même discipline que `DownloadDocumentVersionUseCase`/`DownloadExportArtifact
 * UseCase`). Un `revisionId` seul ne suffit jamais : la lignée parente (`GeneratedDocument`) est
 * résolue pour retrouver le `tenderId`, PUIS le ClientAccess de CE Tender est vérifié — jamais un
 * accès direct par id sans passer par cette résolution complète (même motif anti-IDOR que le reste
 * du module).
 */
@Injectable()
export class DownloadGeneratedDocumentRevisionUseCase {
  constructor(
    @Inject(GENERATED_DOCUMENT_REPOSITORY) private readonly generatedDocumentRepository: GeneratedDocumentRepository,
    @Inject(DOCUMENT_VERSION_REPOSITORY) private readonly documentVersionRepository: DocumentVersionRepository,
    @Inject(STORAGE_PROVIDER) private readonly storageProvider: StorageProvider,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(query: DownloadGeneratedDocumentRevisionQuery): Promise<GeneratedDocumentRevisionDownload> {
    const revision = await this.generatedDocumentRepository.findRevisionById({ organizationId: query.organizationId, revisionId: query.revisionId });
    if (!revision) {
      throw new GeneratedDocumentRevisionNotFoundError();
    }

    const generatedDocument = await this.generatedDocumentRepository.findById({ organizationId: query.organizationId, generatedDocumentId: revision.generatedDocumentId });
    if (!generatedDocument) {
      throw new GeneratedDocumentNotFoundError();
    }

    await assertDocumentGenerationAccess(this.getTenderUseCase, this.assertClientAccessUseCase, {
      organizationId: query.organizationId,
      tenderId: generatedDocument.tenderId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      permission: ClientPermission.ReadDocumentGeneration,
    });

    if (!revision.artifactDocumentId || !revision.artifactDocumentVersionId) {
      throw new ArtifactNotReadyError();
    }

    const version = await this.documentVersionRepository.findById({
      organizationId: query.organizationId,
      documentId: revision.artifactDocumentId,
      versionId: revision.artifactDocumentVersionId,
    });
    if (!version) {
      throw new ArtifactNotReadyError();
    }

    const stream = await this.storageProvider.openReadStream(version.storageKey);
    return { stream, contentType: version.mimeType, filename: version.originalFilename, sizeBytes: version.sizeBytes };
  }
}
