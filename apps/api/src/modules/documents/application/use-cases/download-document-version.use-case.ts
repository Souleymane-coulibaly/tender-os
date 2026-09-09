import { Inject, Injectable, Optional } from "@nestjs/common";
import type { Readable } from "node:stream";
import { GetTenderUseCase } from "../../../tenders";
import { DocumentNotFoundError, DocumentVersionNotFoundError } from "../../domain/errors";
import { DocumentPermission } from "../../domain/document-permission";
import type { DocumentVersion } from "../../domain/document-version.entity";
import { assertHasDocumentPermission } from "../policies/document-authorization.policy";
import { assertDocumentClientAccess } from "../policies/document-client-access.helper";
import { DOCUMENT_ACCESS_NARROWING, type DocumentAccessNarrowingPolicy } from "../ports/document-access-narrowing";
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

/** Résultat d'une lecture SERVEUR-À-SERVEUR (mission P1 R2/Connecteurs) — jamais une URL, jamais
 *  destiné à être renvoyé tel quel dans une réponse HTTP publique. Distinct de `DocumentDownload`
 *  (qui PEUT être une redirection, pensée pour un navigateur) précisément pour qu'un appelant
 *  interne (export connecteur) ne puisse structurellement jamais recevoir de variante `redirect`. */
export type DocumentInternalStream = Readonly<{
  stream: Readable;
  contentType: string;
  filename: string;
  sizeBytes: number;
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
    @Optional() @Inject(DOCUMENT_ACCESS_NARROWING) private readonly accessNarrowing?: DocumentAccessNarrowingPolicy,
  ) {}

  /** Chemin HTTP/navigateur — inchangé (mission P1 R2/Connecteurs §5 : ne jamais casser ce
   *  comportement). Bascule en URL signée dès que le `StorageProvider` actif expose
   *  `generateSignedUrl` (R2), sinon renvoie un flux direct (local). */
  async execute(query: DownloadDocumentVersionQuery): Promise<DocumentDownload> {
    const version = await this.resolveAuthorizedVersion(query);

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

  /**
   * Mission P1 R2/Connecteurs — lecture SERVEUR-À-SERVEUR pour un consommateur interne (export
   * connecteur Microsoft/Google). Réutilise EXACTEMENT la même autorisation/résolution que
   * `execute()` (`resolveAuthorizedVersion`, jamais dupliquée) mais retourne TOUJOURS un flux
   * direct, jamais une URL signée — un connecteur tiers ne doit jamais recevoir une redirection
   * pensée pour un navigateur authentifié (mission §3 : ne pas confondre les deux besoins).
   * `getMetadata` distingue explicitement "objet absent du stockage" (traduit dans le vocabulaire
   * déjà existant du module Documents, jamais un succès silencieux) d'une autre panne de lecture
   * (propagée telle quelle — l'appelant ne doit jamais considérer un tel échec comme un export
   * réussi, mission §11).
   */
  async getInternalReadStream(query: DownloadDocumentVersionQuery): Promise<DocumentInternalStream> {
    const version = await this.resolveAuthorizedVersion(query);

    const metadata = await this.storageProvider.getMetadata(version.storageKey);
    if (!metadata) {
      throw new DocumentVersionNotFoundError();
    }

    const stream = await this.storageProvider.openReadStream(version.storageKey);
    return {
      stream,
      contentType: version.mimeType,
      filename: version.sanitizedFilename,
      sizeBytes: version.sizeBytes,
    };
  }

  private async resolveAuthorizedVersion(query: DownloadDocumentVersionQuery): Promise<DocumentVersion> {
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

    // CCV2-D — rétrécissement métier optionnel : un justificatif bancaire candidate exige
    // `candidate:read_banking`, que la permission générique `document:download` (accordée à TOUS
    // les rôles, READ_ONLY inclus) ne suffit jamais à couvrir.
    await this.accessNarrowing?.assertReadable({ organizationId: query.organizationId, documentId: query.documentId, actorRole: query.actorRole });

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

    return version;
  }
}
