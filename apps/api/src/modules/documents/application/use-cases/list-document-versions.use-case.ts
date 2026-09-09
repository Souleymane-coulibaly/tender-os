import { Inject, Injectable, Optional } from "@nestjs/common";
import { DocumentNotFoundError } from "../../domain/errors";
import { DocumentPermission } from "../../domain/document-permission";
import { assertHasDocumentPermission } from "../policies/document-authorization.policy";
import { toDocumentVersionSummary, type DocumentVersionSummary } from "../dtos";
import { DOCUMENT_REPOSITORY, type DocumentRepository } from "../ports/document.repository";
import { DOCUMENT_VERSION_REPOSITORY, type DocumentVersionRepository } from "../ports/document-version.repository";
import { DOCUMENT_ACCESS_NARROWING, type DocumentAccessNarrowingPolicy } from "../ports/document-access-narrowing";

export type ListDocumentVersionsQuery = Readonly<{ organizationId: string; documentId: string; actorRole: string }>;

@Injectable()
export class ListDocumentVersionsUseCase {
  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly documentRepository: DocumentRepository,
    @Inject(DOCUMENT_VERSION_REPOSITORY) private readonly versionRepository: DocumentVersionRepository,
    @Optional() @Inject(DOCUMENT_ACCESS_NARROWING) private readonly accessNarrowing?: DocumentAccessNarrowingPolicy,
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

    // Checkpoint CCV2-F.1 — MÊME rétrécissement métier que `get`/`download` (CCV2-D). Il manquait
    // ici : l'historique des versions expose `originalFilename` et `checksum`, et
    // `DocumentPermission.Read` est accordée à TOUS les rôles — un READ_ONLY pouvait donc énumérer
    // les versions d'un RIB (« RIB-BNP-Alpha.pdf ») sans `candidate:read_banking`. Placé APRÈS la
    // résolution du document, comme sur les deux autres routes, pour ne rien révéler par un timing.
    await this.accessNarrowing?.assertReadable({ organizationId: query.organizationId, documentId: query.documentId, actorRole: query.actorRole });

    const versions = await this.versionRepository.listByDocument({
      organizationId: query.organizationId,
      documentId: query.documentId,
    });

    return versions.map(toDocumentVersionSummary);
  }
}
