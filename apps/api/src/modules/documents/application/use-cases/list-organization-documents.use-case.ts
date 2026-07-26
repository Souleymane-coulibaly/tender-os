import { Inject, Injectable } from "@nestjs/common";
import type { DocumentDomain } from "../../domain/document-domain";
import type { DocumentOrigin } from "../../domain/document-origin";
import { DocumentPermission } from "../../domain/document-permission";
import type { DocumentStatus } from "../../domain/document-status";
import { assertHasDocumentPermission } from "../policies/document-authorization.policy";
import { toDocumentSummary, type DocumentSummary } from "../dtos";
import { DOCUMENT_REPOSITORY, type DocumentRepository } from "../ports/document.repository";
import { DOCUMENT_VERSION_REPOSITORY, type DocumentVersionRepository } from "../ports/document-version.repository";

export type ListOrganizationDocumentsQuery = Readonly<{
  organizationId: string;
  actorRole: string;
  cursor?: string | undefined;
  limit: number;
  status?: DocumentStatus | undefined;
  origin?: DocumentOrigin | undefined;
  domain?: DocumentDomain | undefined;
  createdByUserId?: string | undefined;
  search?: string | undefined;
  sort?: "createdAt" | "updatedAt" | "title" | "sizeBytes" | "currentVersionNumber" | undefined;
  sortDirection?: "asc" | "desc" | undefined;
}>;

export type ListOrganizationDocumentsResult = Readonly<{ items: DocumentSummary[]; nextCursor: string | null }>;

@Injectable()
export class ListOrganizationDocumentsUseCase {
  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly documentRepository: DocumentRepository,
    @Inject(DOCUMENT_VERSION_REPOSITORY) private readonly versionRepository: DocumentVersionRepository,
  ) {}

  async execute(query: ListOrganizationDocumentsQuery): Promise<ListOrganizationDocumentsResult> {
    assertHasDocumentPermission(query.actorRole, DocumentPermission.Read);

    const page = await this.documentRepository.list({
      organizationId: query.organizationId,
      cursor: query.cursor,
      limit: query.limit,
      status: query.status,
      origin: query.origin,
      domain: query.domain,
      createdByUserId: query.createdByUserId,
      search: query.search,
      sort: query.sort,
      sortDirection: query.sortDirection,
    });

    const versionIds = page.items.map((document) => document.currentVersionId).filter((id): id is string => !!id);
    const versions = await this.versionRepository.findByIds({ organizationId: query.organizationId, versionIds });
    const versionsById = new Map(versions.map((version) => [version.id, version]));

    return {
      items: page.items.map((document) =>
        toDocumentSummary(document, document.currentVersionId ? versionsById.get(document.currentVersionId) : undefined),
      ),
      nextCursor: page.nextCursor,
    };
  }
}
