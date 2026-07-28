import { Inject, Injectable, Logger } from "@nestjs/common";
import { DOCUMENT_REPOSITORY, type DocumentRepository } from "../ports/document.repository";
import { DOCUMENT_VERSION_REPOSITORY, type DocumentVersionRepository } from "../ports/document-version.repository";
import { STORAGE_PROVIDER, type StorageProvider } from "../ports/storage-provider";

export type PurgeJustCreatedDocumentCommand = Readonly<{ organizationId: string; documentId: string }>;

/**
 * Nettoyage technique interne — jamais un endpoint HTTP, jamais soumis au RBAC utilisateur
 * (`DocumentPermission`), jamais appelé pour une suppression demandée par un utilisateur (voir
 * `DeleteDocumentUseCase` pour ce cas : protégé par permission, réversible via `deletedAt`).
 *
 * Réservé à l'annulation d'un Document créé DANS la même tentative d'écriture qui vient d'échouer
 * juste après (ex. `ImportDceFilesUseCase` quand la création du `DceDocument` échoue après que le
 * Document sous-jacent a déjà été créé avec succès) — l'acteur ayant déclenché cette tentative
 * (ex. un CONTRIBUTOR qui possède `dce:import` mais jamais `DocumentPermission.Delete`) n'a pas
 * à posséder de permission de suppression pour que ce rattrapage réussisse : ce n'est pas une
 * suppression métier, c'est un rollback technique d'une écriture qui n'aurait jamais dû aboutir.
 *
 * Garde-fou contre toute utilisation incorrecte (ex. un documentId réutilisé par erreur, ou un
 * Document déjà légitimement utilisé) : refuse de purger tout Document qui ne compte pas
 * EXACTEMENT une version — un Document réellement "tout juste créé" par la tentative en cours n'a
 * jamais eu le temps d'en recevoir une deuxième. Cette méthode ne lève jamais elle-même : un échec
 * de nettoyage (stockage ou base) est journalisé en erreur critique, jamais remonté à l'appelant,
 * pour que l'erreur métier d'origine reste toujours prioritaire.
 */
@Injectable()
export class InternalDocumentCleanupService {
  private readonly logger = new Logger(InternalDocumentCleanupService.name);

  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly documentRepository: DocumentRepository,
    @Inject(DOCUMENT_VERSION_REPOSITORY) private readonly documentVersionRepository: DocumentVersionRepository,
    @Inject(STORAGE_PROVIDER) private readonly storageProvider: StorageProvider,
  ) {}

  async purgeJustCreatedDocument(command: PurgeJustCreatedDocumentCommand): Promise<void> {
    const document = await this.documentRepository.findById({
      organizationId: command.organizationId,
      documentId: command.documentId,
    });

    if (!document) {
      this.logger.error(
        `Internal cleanup refused: no Document ${command.documentId} found for organization ` +
          `${command.organizationId} — nothing to purge, or a cross-tenant mismatch occurred.`,
      );
      return;
    }

    if (document.currentVersionNumber !== 1) {
      this.logger.error(
        `Internal cleanup refused: Document ${command.documentId} has ${document.currentVersionNumber} ` +
          "version(s), expected exactly 1 — refusing to purge a document that may not be this attempt's own artifact.",
      );
      return;
    }

    if (document.currentVersionId) {
      const version = await this.documentVersionRepository.findById({
        organizationId: command.organizationId,
        documentId: command.documentId,
        versionId: document.currentVersionId,
      });
      if (version) {
        await this.storageProvider.delete(version.storageKey).catch((error: unknown) => {
          this.logger.error(
            `Internal cleanup: failed to delete stored object "${version.storageKey}" for Document ` +
              `${command.documentId}. Manual cleanup required.`,
            error instanceof Error ? error.stack : String(error),
          );
        });
      }
    }

    await this.documentRepository
      .hardDeleteJustCreatedDocument({ organizationId: command.organizationId, documentId: command.documentId })
      .catch((error: unknown) => {
        this.logger.error(
          `Internal cleanup: failed to hard-delete Document ${command.documentId} ` +
            `(organization ${command.organizationId}). Manual cleanup required.`,
          error instanceof Error ? error.stack : String(error),
        );
      });
  }
}
