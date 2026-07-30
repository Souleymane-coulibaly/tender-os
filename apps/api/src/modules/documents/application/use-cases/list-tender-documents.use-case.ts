import { Inject, Injectable } from "@nestjs/common";
import { GetTenderUseCase } from "../../../tenders";
import { DocumentPermission } from "../../domain/document-permission";
import { assertHasDocumentPermission } from "../policies/document-authorization.policy";
import { toDocumentSummary, type DocumentSummary } from "../dtos";
import { DOCUMENT_REPOSITORY, type DocumentRepository } from "../ports/document.repository";
import { DOCUMENT_VERSION_REPOSITORY, type DocumentVersionRepository } from "../ports/document-version.repository";

export type ListTenderDocumentsQuery = Readonly<{ organizationId: string; tenderId: string; actorRole: string; actorId: string }>;

/**
 * Vérifie l'existence du Tender dans l'organisation active via le use case public de Tenders
 * (jamais un accès direct à son repository interne) avant de lister les documents associés —
 * conception §D, §K : dépendance autorisée Documents → Tenders, jamais l'inverse.
 */
@Injectable()
export class ListTenderDocumentsUseCase {
  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly documentRepository: DocumentRepository,
    @Inject(DOCUMENT_VERSION_REPOSITORY) private readonly versionRepository: DocumentVersionRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
  ) {}

  async execute(query: ListTenderDocumentsQuery): Promise<DocumentSummary[]> {
    assertHasDocumentPermission(query.actorRole, DocumentPermission.Read);

    await this.getTenderUseCase.execute({
      organizationId: query.organizationId,
      tenderId: query.tenderId,
      actorRole: query.actorRole,
      actorId: query.actorId,
    });

    const documents = await this.documentRepository.listByTenderId({
      organizationId: query.organizationId,
      tenderId: query.tenderId,
    });

    const versionIds = documents.map((document) => document.currentVersionId).filter((id): id is string => !!id);
    const versions = await this.versionRepository.findByIds({ organizationId: query.organizationId, versionIds });
    const versionsById = new Map(versions.map((version) => [version.id, version]));

    return documents.map((document) =>
      toDocumentSummary(document, document.currentVersionId ? versionsById.get(document.currentVersionId) : undefined),
    );
  }
}
