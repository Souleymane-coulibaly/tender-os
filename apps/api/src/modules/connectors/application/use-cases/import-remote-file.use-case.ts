import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { getRequiredEnv } from "../../../../shared-kernel/env";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { AttachDocumentToTenderUseCase, CreateDocumentWithFirstVersionUseCase, AddDocumentVersionUseCase, GetDocumentUseCase, DocumentDomain, DocumentOrigin, type DocumentSummary } from "../../../documents";
import { assertHasConnectorPermission, ConnectorPermission } from "../../domain/connector-permission";
import { ExternalConnectionClientNotAllowedError, ExternalConnectionNotFoundError, ExternalFileOperationInProgressError } from "../../domain/errors";
import { ExternalFileImportRecord } from "../../domain/external-file-import-record.entity";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { CONNECTOR_PROVIDER_ADAPTERS, type ConnectorProviderAdapterMap } from "../ports/connector-provider-adapter";
import { EXTERNAL_CONNECTION_REPOSITORY, type ExternalConnectionRepository } from "../ports/external-connection.repository";
import { EXTERNAL_FILE_IMPORT_RECORD_REPOSITORY, type ExternalFileImportRecordRepository } from "../ports/external-file-import-record.repository";
import { callWithReactiveReauth } from "../services/call-with-reactive-reauth";
import { EnsureFreshAccessTokenService } from "../services/ensure-fresh-access-token.service";
import { getAdapter } from "../services/get-adapter";
import { sleep } from "../services/sleep";

export type ImportRemoteFileCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  connectionId: string;
  containerId: string;
  fileId: string;
  mimeType: string;
  clientAccountId?: string | undefined;
  tenderId?: string | undefined;
  targetDocumentId?: string | undefined;
  title?: string | undefined;
}>;

function maxDocumentFileSizeBytes(): number {
  return Number(getRequiredEnv("DOCUMENT_MAX_FILE_SIZE_MB")) * 1024 * 1024;
}

/** Mission Codex P1-002 — un traitement en cours (réservation PENDING fraîche posée par un autre
 *  appel) doit dépasser cette durée avant d'être considéré abandonné (crash process) et repris —
 *  largement au-dessus du pire cas du client HTTP centralisé (3 tentatives x 15s + backoff). */
const STALE_PENDING_MS = 120_000;
/** Budget d'attente d'un appelant "perdant" une course pour la clé — attend la complétion du
 *  "gagnant" plutôt que de dupliquer le traitement, borné pour ne jamais bloquer indéfiniment. */
const WAIT_POLL_INTERVAL_MS = 250;
const MAX_WAIT_ATTEMPTS = 240;

type ImportReservationOutcome =
  | Readonly<{ kind: "reuse"; document: DocumentSummary }>
  | Readonly<{ kind: "proceed"; record: ExternalFileImportRecord; reuseTargetDocumentId?: string | undefined }>;

/**
 * Mission §19 — SharePoint/OneDrive/Drive -> Document/DocumentVersion. Réutilise TEL QUEL les
 * use-cases `documents` existants (jamais un second stockage documentaire, mission §19) : la
 * vérification Tender+ClientAccess de la cible d'attachement reste entièrement à la charge
 * d'`AttachDocumentToTenderUseCase` (via `GetTenderUseCase`), jamais dupliquée ici (mission §50).
 * Le narrowing `allowedClientAccountIds` de la CONNEXION (mission §49/§52) est vérifié en plus,
 * AVANT tout appel provider — une connexion restreinte au Client A ne doit jamais servir à
 * importer quoi que ce soit dans le contexte du Client B, même si l'acteur y a par ailleurs accès.
 *
 * Mission §26 (POINT MAJEUR DU SPRINT) — idempotence : un import automatique/retenté du MÊME
 * fichier distant (identique `connectionId`+`containerId`+`fileId`+`targetDocumentId`), contenu
 * STRICTEMENT IDENTIQUE (checksum SHA-256 du contenu téléchargé), réutilise le Document/
 * DocumentVersion déjà produits au lieu d'en créer un doublon. Un contenu réellement modifié côté
 * provider (checksum différent) produit toujours une nouvelle version légitime.
 *
 * Correctif audit Codex (P1-002) — le verrou consultatif Postgres (`withLock`) ne protège plus QUE
 * la décision courte "réutiliser / réserver / attendre" (`reserveOrReuse`) : il n'est JAMAIS tenu
 * pendant le traitement lent (création Document, écriture StorageProvider, potentiellement réseau)
 * qui a lieu entièrement HORS transaction. Un appelant concurrent qui trouve une réservation PENDING
 * fraîche attend (poll borné) la complétion du premier plutôt que de dupliquer le traitement ; au-
 * delà du budget d'attente, `ExternalFileOperationInProgressError` (409) invite à réessayer.
 */
@Injectable()
export class ImportRemoteFileUseCase {
  constructor(
    @Inject(EXTERNAL_CONNECTION_REPOSITORY) private readonly connectionRepository: ExternalConnectionRepository,
    @Inject(CONNECTOR_PROVIDER_ADAPTERS) private readonly adapters: ConnectorProviderAdapterMap,
    @Inject(EXTERNAL_FILE_IMPORT_RECORD_REPOSITORY) private readonly importRecordRepository: ExternalFileImportRecordRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    private readonly ensureFreshAccessToken: EnsureFreshAccessTokenService,
    private readonly createDocumentWithFirstVersion: CreateDocumentWithFirstVersionUseCase,
    private readonly addDocumentVersion: AddDocumentVersionUseCase,
    private readonly attachDocumentToTender: AttachDocumentToTenderUseCase,
    private readonly getDocument: GetDocumentUseCase,
  ) {}

  async execute(command: ImportRemoteFileCommand): Promise<DocumentSummary> {
    assertHasConnectorPermission(command.actorRole, ConnectorPermission.DocumentImport);

    const connection = await this.connectionRepository.findById({ organizationId: command.organizationId, connectionId: command.connectionId });
    if (!connection) {
      throw new ExternalConnectionNotFoundError();
    }
    if (!connection.isClientAllowed(command.clientAccountId)) {
      throw new ExternalConnectionClientNotAllowedError();
    }

    const adapter = getAdapter(this.adapters, connection.provider);
    const downloaded = await callWithReactiveReauth({
      connection,
      ensureFreshAccessToken: this.ensureFreshAccessToken,
      operation: (accessToken) => adapter.downloadFile(accessToken, { containerId: command.containerId, fileId: command.fileId, mimeType: command.mimeType }),
    });
    const contentChecksum = createHash("sha256").update(downloaded.buffer).digest("hex");

    const reservation = await this.reserveOrReuse(command, contentChecksum);
    if (reservation.kind === "reuse") {
      return reservation.document;
    }

    const { record } = reservation;
    try {
      const file = { buffer: downloaded.buffer, originalFilename: downloaded.filename, mimeType: downloaded.mimeType };
      const maxFileSizeBytes = maxDocumentFileSizeBytes();
      // Contenu MODIFIÉ sur un fichier déjà importé une fois (même remote file, encore
      // accessible) : nouvelle version du MÊME document, jamais un second Document dupliqué pour
      // le même fichier distant — le `targetDocumentId` explicite de l'appelant reste toujours
      // prioritaire.
      const effectiveTargetDocumentId = command.targetDocumentId ?? reservation.reuseTargetDocumentId;

      const document = effectiveTargetDocumentId
        ? await this.addDocumentVersion.execute({ organizationId: command.organizationId, documentId: effectiveTargetDocumentId, actorId: command.actorId, actorRole: command.actorRole, file, maxFileSizeBytes })
        : await this.createDocumentWithFirstVersion.execute({
            organizationId: command.organizationId,
            actorId: command.actorId,
            actorRole: command.actorRole,
            title: command.title ?? downloaded.filename,
            origin: DocumentOrigin.Imported,
            domain: command.tenderId ? DocumentDomain.Tender : DocumentDomain.Organization,
            file,
            maxFileSizeBytes,
          });

      if (command.tenderId && !effectiveTargetDocumentId) {
        await this.attachDocumentToTender.execute({ organizationId: command.organizationId, documentId: document.id, tenderId: command.tenderId, actorId: command.actorId, actorRole: command.actorRole });
      }

      const occurredAt = this.clock.now();
      connection.recordSuccessfulSync(occurredAt);
      await this.connectionRepository.save(connection);

      record.markSucceeded({ documentId: document.id, documentVersionId: document.currentVersion!.id, contentChecksum, occurredAt });
      await this.importRecordRepository.save(record);

      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorType: "USER",
        actorId: command.actorId,
        action: "connector.document_imported",
        resourceType: "Document",
        resourceId: document.id,
        metadata: { provider: connection.provider, connectionId: connection.id, remoteFileId: command.fileId },
      });

      return document;
    } catch (error) {
      // Échec du traitement lent : ne jamais laisser une réservation PENDING bloquer indéfiniment
      // un futur essai — best-effort, la contrainte UNIQUE reste le filet de sécurité même si cette
      // suppression échoue.
      await this.importRecordRepository.delete(record.id);
      throw error;
    }
  }

  /** Décision COURTE, sous verrou consultatif Postgres (mission Codex P1-002 : jamais le traitement
   *  lent lui-même à l'intérieur — uniquement des lectures Postgres, `GetDocumentUseCase` compris,
   *  jamais un appel réseau externe). */
  private async reserveOrReuse(command: ImportRemoteFileCommand, contentChecksum: string): Promise<ImportReservationOutcome> {
    const key = { connectionId: command.connectionId, remoteContainerId: command.containerId, remoteFileId: command.fileId, targetDocumentId: command.targetDocumentId };

    for (let attempt = 0; attempt < MAX_WAIT_ATTEMPTS; attempt += 1) {
      const outcome = await this.importRecordRepository.withLock(key, async () => {
        const now = this.clock.now();
        const existingRecord = await this.importRecordRepository.findByRemoteFile({ organizationId: command.organizationId, ...key });

        if (existingRecord?.isSucceeded()) {
          if (existingRecord.matchesChecksum(contentChecksum)) {
            try {
              // Mission §26 — la ligne de suivi ne garantit pas à elle seule que le Document existe
              // encore/reste accessible à CET acteur : `GetDocumentUseCase` revérifie tout (lecture
              // Postgres pure, jamais un appel réseau externe — sans risque à garder sous verrou).
              const document = await this.getDocument.execute({ organizationId: command.organizationId, documentId: existingRecord.documentId!, actorRole: command.actorRole, actorId: command.actorId });
              return { type: "reuse" as const, document };
            } catch {
              // Trace obsolète (document supprimé/inaccessible depuis) — reprend une réservation
              // fraîche plutôt que de renvoyer une erreur inattendue.
            }
          }
          // Contenu changé (ou trace obsolète ci-dessus) — nouvelle version du MÊME document.
          const reuseTargetDocumentId = existingRecord.documentId;
          existingRecord.reopen({ contentChecksum, occurredAt: now });
          await this.importRecordRepository.save(existingRecord);
          return { type: "proceed" as const, record: existingRecord, reuseTargetDocumentId };
        }

        if (existingRecord && !existingRecord.isStalePending(now, STALE_PENDING_MS)) {
          // Un autre appelant traite CETTE clé en ce moment — jamais un second traitement en
          // parallèle pour la même clé.
          return { type: "wait" as const };
        }

        const record = existingRecord ?? ExternalFileImportRecord.reserve({ id: this.idGenerator.generate(), organizationId: command.organizationId, ...key, contentChecksum, occurredAt: now });
        if (existingRecord) {
          existingRecord.reopen({ contentChecksum, occurredAt: now });
        }
        await this.importRecordRepository.save(record);
        return { type: "proceed" as const, record, reuseTargetDocumentId: undefined };
      });

      if (outcome.type === "reuse") return { kind: "reuse", document: outcome.document };
      if (outcome.type === "proceed") return { kind: "proceed", record: outcome.record, reuseTargetDocumentId: outcome.reuseTargetDocumentId };
      await sleep(WAIT_POLL_INTERVAL_MS);
    }

    throw new ExternalFileOperationInProgressError();
  }
}
