import { Inject, Injectable, Optional } from "@nestjs/common";
import type { DocumentDomain } from "../../domain/document-domain";
import type { DocumentOrigin } from "../../domain/document-origin";
import { DocumentPermission } from "../../domain/document-permission";
import type { DocumentStatus } from "../../domain/document-status";
import { assertHasDocumentPermission } from "../policies/document-authorization.policy";
import { toDocumentSummary, type DocumentSummary } from "../dtos";
import { DOCUMENT_REPOSITORY, type DocumentRepository } from "../ports/document.repository";
import { DOCUMENT_VERSION_REPOSITORY, type DocumentVersionRepository } from "../ports/document-version.repository";
import { DOCUMENT_ACCESS_NARROWING, type DocumentAccessNarrowingPolicy } from "../ports/document-access-narrowing";

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
    /**
     * Checkpoint TENDEROS-2.1-CCV2-I.3 — le bornage metier s'applique AUSSI a la liste.
     *
     * `GetDocument`, `ListDocumentVersions` et `DownloadDocumentVersion` l'appliquaient deja depuis
     * CCV2-D/F.1, mais pas la liste d'organisation : un justificatif bancaire candidate y figurait
     * donc avec son titre et ses metadonnees de version pour n'importe quel role, `READ_ONLY`
     * compris. Le detail etait ferme, la vitrine ne l'etait pas — et l'existence meme d'une piece
     * bancaire est deja une information.
     *
     * OPTIONNEL, comme partout ailleurs : sans bridge enregistre, le comportement est strictement
     * inchange.
     */
    @Optional() @Inject(DOCUMENT_ACCESS_NARROWING) private readonly accessNarrowing?: DocumentAccessNarrowingPolicy,
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

    // Filtrage AVANT la resolution des versions : inutile de charger les metadonnees de documents
    // qui ne seront pas rendus, et surtout aucune donnee masquee ne transite plus loin.
    const items = await this.filterReadable(query, page.items);

    const versionIds = items.map((document) => document.currentVersionId).filter((id): id is string => !!id);
    const versions = await this.versionRepository.findByIds({ organizationId: query.organizationId, versionIds });
    const versionsById = new Map(versions.map((version) => [version.id, version]));

    return {
      items: items.map((document) =>
        toDocumentSummary(document, document.currentVersionId ? versionsById.get(document.currentVersionId) : undefined),
      ),
      nextCursor: page.nextCursor,
    };
  }

  /**
   * Ne retire QUE ce que la politique metier declare illisible. Une politique absente, ou depourvue
   * de variante en lot, laisse la page intacte : ce point d'extension ne durcit jamais implicitement.
   *
   * La pagination n'est deliberement PAS recompletee apres filtrage — une page peut donc contenir
   * moins d'elements que `limit`. Recharger jusqu'a remplir la page revelerait, par le nombre de
   * requetes ou la position du curseur, l'existence des documents masques : exactement ce que le
   * bornage cherche a empecher.
   */
  private async filterReadable<T extends { id: { value: string } }>(
    query: Readonly<{ organizationId: string; actorRole: string }>,
    documents: readonly T[],
  ): Promise<T[]> {
    if (!this.accessNarrowing?.filterReadable || documents.length === 0) {
      return [...documents];
    }
    const readableIds = new Set(
      await this.accessNarrowing.filterReadable({
        organizationId: query.organizationId,
        documentIds: documents.map((document) => document.id.value),
        actorRole: query.actorRole,
      }),
    );
    return documents.filter((document) => readableIds.has(document.id.value));
  }
}
