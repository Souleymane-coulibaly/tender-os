import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { DownloadDocumentVersionUseCase } from "../../../documents";
import { assertHasConnectorPermission, ConnectorPermission } from "../../domain/connector-permission";
import { ExternalConnectionClientNotAllowedError, ExternalConnectionNotFoundError, ExternalFileOperationInProgressError, ExternalFileExportNeedsReconciliationError, RemoteProviderError } from "../../domain/errors";
import { ExternalFileExportRecord } from "../../domain/external-file-export-record.entity";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { CONNECTOR_PROVIDER_ADAPTERS, type ConnectorProviderAdapterMap } from "../ports/connector-provider-adapter";
import type { RemoteFile } from "../ports/connector-provider-adapter";
import { EXTERNAL_CONNECTION_REPOSITORY, type ExternalConnectionRepository } from "../ports/external-connection.repository";
import { EXTERNAL_FILE_EXPORT_RECORD_REPOSITORY, type ExternalFileExportRecordRepository } from "../ports/external-file-export-record.repository";
import { callWithReactiveReauth } from "../services/call-with-reactive-reauth";
import { EnsureFreshAccessTokenService } from "../services/ensure-fresh-access-token.service";
import { getAdapter } from "../services/get-adapter";
import { sleep } from "../services/sleep";

export type ExportDocumentVersionCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  connectionId: string;
  containerId: string;
  folderId: string;
  documentId: string;
  /** Toujours une version PRÉCISE (mission §42) — jamais "la version courante" résolue
   *  implicitement, même si l'API `documents` le permettrait. */
  versionId: string;
  clientAccountId?: string | undefined;
  filename?: string | undefined;
}>;

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/** Mission Codex P1-002 — même budgets que `ImportRemoteFileUseCase`, voir son commentaire. */
const STALE_PENDING_MS = 120_000;
const WAIT_POLL_INTERVAL_MS = 250;
const MAX_WAIT_ATTEMPTS = 240;

type ExportReservationOutcome = Readonly<{ kind: "reuse"; remoteFile: RemoteFile }> | Readonly<{ kind: "proceed"; record: ExternalFileExportRecord }>;

/**
 * Mission §20/§21/§51/§52 — TenderOS -> SharePoint/OneDrive/Drive. Réutilise
 * `DownloadDocumentVersionUseCase` (mission §51 : la lecture reste entièrement gouvernée par les
 * règles `documents` — permission + appartenance Tender/ClientAccess, jamais dupliquées ici),
 * PUIS vérifie en plus le narrowing de la CONNEXION (mission §52, même motif que l'import) — les
 * deux couches d'autorisation sont indépendantes et toutes deux nécessaires.
 *
 * Mission §27 (POINT MAJEUR DU SPRINT) — idempotence : un export retenté vers la MÊME destination
 * exacte (DocumentVersion + connexion + container + dossier + nom de fichier) — typiquement après
 * un timeout réseau côté TenderOS alors que l'upload provider a en réalité réussi — réutilise le
 * `RemoteFile` déjà obtenu au lieu de ré-uploader, jamais une copie distante non maîtrisée.
 *
 * Correctif audit Codex (P1-002) — le verrou consultatif Postgres (`withLock`) ne protège plus QUE
 * la décision courte "réutiliser / réserver / attendre" (`reserveOrReuse`) : il n'est JAMAIS tenu
 * pendant `adapter.uploadFile` (appel réseau externe, potentiellement lent — jusqu'à 3 tentatives x
 * 15s + backoff via le client HTTP centralisé), qui a lieu entièrement HORS transaction. Un
 * appelant concurrent qui trouve une réservation PENDING fraîche attend (poll borné) la complétion
 * du premier plutôt que de dupliquer l'upload ; au-delà du budget d'attente,
 * `ExternalFileOperationInProgressError` (409) invite à réessayer.
 *
 * Correctif audit Codex (P1-003) — le scénario que la mission §27 décrit explicitement ("réponse
 * perdue côté TenderOS alors que l'upload provider a en réalité réussi") n'était PAS couvert par le
 * P1-002 seul : un échec d'upload supprimait systématiquement la réservation, y compris quand
 * l'échec était AMBIGU (timeout/connexion perdue — le fichier a peut-être été créé côté provider
 * malgré tout, voir `RemoteProviderError.isAmbiguousOutcome`). Un tel échec marque désormais la
 * réservation `NEEDS_RECONCILIATION` (jamais supprimée) et BLOQUE tout nouvel essai automatique vers
 * cette MÊME destination (`ExternalFileExportNeedsReconciliationError`, 409) — jamais un second
 * upload silencieux qui risquerait de dupliquer un fichier déjà créé. Seul un échec DÉFINITIF
 * (statut HTTP réellement reçu du provider, ex. 4xx/5xx) reste "safe to retry" (réservation
 * supprimée, comme avant).
 */
@Injectable()
export class ExportDocumentVersionUseCase {
  constructor(
    @Inject(EXTERNAL_CONNECTION_REPOSITORY) private readonly connectionRepository: ExternalConnectionRepository,
    @Inject(CONNECTOR_PROVIDER_ADAPTERS) private readonly adapters: ConnectorProviderAdapterMap,
    @Inject(EXTERNAL_FILE_EXPORT_RECORD_REPOSITORY) private readonly exportRecordRepository: ExternalFileExportRecordRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    private readonly ensureFreshAccessToken: EnsureFreshAccessTokenService,
    private readonly downloadDocumentVersion: DownloadDocumentVersionUseCase,
  ) {}

  async execute(command: ExportDocumentVersionCommand): Promise<RemoteFile> {
    assertHasConnectorPermission(command.actorRole, ConnectorPermission.DocumentExport);

    const connection = await this.connectionRepository.findById({ organizationId: command.organizationId, connectionId: command.connectionId });
    if (!connection) {
      throw new ExternalConnectionNotFoundError();
    }
    if (!connection.isClientAllowed(command.clientAccountId)) {
      throw new ExternalConnectionClientNotAllowedError();
    }

    // Correctif audit Codex P1 (R2/Connecteurs) — `execute()` bascule en URL signée dès que le
    // `StorageProvider` actif expose `generateSignedUrl` (R2), un contrat pensé pour un
    // téléchargement navigateur (mission §3/§5). Un connecteur tiers a besoin d'une lecture
    // SERVEUR-À-SERVEUR : `getInternalReadStream` réutilise EXACTEMENT la même autorisation que
    // `execute()` mais retourne toujours un flux direct, quel que soit le `StorageProvider` actif
    // (local ou R2) — jamais de HTTP GET du backend vers sa propre URL R2 signée (mission §3).
    const download = await this.downloadDocumentVersion.getInternalReadStream({
      organizationId: command.organizationId,
      documentId: command.documentId,
      versionId: command.versionId,
      actorId: command.actorId,
      actorRole: command.actorRole,
    });

    const filename = command.filename ?? download.filename;

    const reservation = await this.reserveOrReuse(command, filename);
    if (reservation.kind === "reuse") {
      return reservation.remoteFile;
    }

    const { record } = reservation;
    try {
      const adapter = getAdapter(this.adapters, connection.provider);
      const content = await streamToBuffer(download.stream);
      const uploaded = await callWithReactiveReauth({
        connection,
        ensureFreshAccessToken: this.ensureFreshAccessToken,
        operation: (accessToken) =>
          adapter.uploadFile(accessToken, {
            containerId: command.containerId,
            folderId: command.folderId,
            filename,
            content,
            mimeType: download.contentType,
          }),
      });

      const occurredAt = this.clock.now();
      connection.recordSuccessfulSync(occurredAt);
      await this.connectionRepository.save(connection);

      record.markSucceeded({
        remoteFileId: uploaded.id,
        remoteFileMimeType: uploaded.mimeType,
        remoteFileSizeBytes: uploaded.sizeBytes,
        remoteFileModifiedAt: uploaded.modifiedAt,
        remoteFileETag: uploaded.eTag,
        remoteFileWebUrl: uploaded.webUrl,
        occurredAt,
      });
      await this.exportRecordRepository.save(record);

      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorType: "USER",
        actorId: command.actorId,
        action: "connector.document_exported",
        resourceType: "DocumentVersion",
        resourceId: command.versionId,
        metadata: { provider: connection.provider, connectionId: connection.id, remoteFileId: uploaded.id },
      });

      return uploaded;
    } catch (error) {
      if (error instanceof RemoteProviderError && error.isAmbiguousOutcome) {
        // Correctif audit Codex (P1-003) — TenderOS n'a jamais reçu de réponse du provider : le
        // fichier a peut-être été créé malgré tout. Ne JAMAIS supprimer la réservation (un retry
        // silencieux pourrait dupliquer un fichier déjà créé) — la marquer comme nécessitant une
        // vérification manuelle à la place.
        record.markNeedsReconciliation(this.clock.now());
        await this.exportRecordRepository.save(record);
        throw error;
      }
      // Échec DÉFINITIF (statut HTTP réellement reçu du provider, ou erreur locale avant tout appel
      // réseau) : safe to retry — ne jamais laisser une réservation PENDING bloquer indéfiniment un
      // futur essai. Best-effort, la contrainte UNIQUE reste le filet de sécurité même si cette
      // suppression échoue.
      await this.exportRecordRepository.delete(record.id);
      throw error;
    }
  }

  /** Décision COURTE, sous verrou consultatif Postgres (mission Codex P1-002 : jamais l'upload
   *  provider à l'intérieur — uniquement des lectures Postgres). */
  private async reserveOrReuse(command: ExportDocumentVersionCommand, filename: string): Promise<ExportReservationOutcome> {
    const key = { connectionId: command.connectionId, documentId: command.documentId, documentVersionId: command.versionId, remoteContainerId: command.containerId, remoteFolderId: command.folderId, filename };

    for (let attempt = 0; attempt < MAX_WAIT_ATTEMPTS; attempt += 1) {
      const outcome = await this.exportRecordRepository.withLock(key, async () => {
        const now = this.clock.now();
        const existingRecord = await this.exportRecordRepository.findByDestination({ organizationId: command.organizationId, ...key });

        if (existingRecord?.isSucceeded()) {
          return { type: "reuse" as const, remoteFile: existingRecord.toRemoteFile() };
        }

        if (existingRecord?.needsReconciliation()) {
          // Correctif audit Codex (P1-003) — jamais un nouvel essai automatique tant que l'échec
          // précédent reste ambigu (le fichier a peut-être déjà été créé côté provider) : bloque
          // immédiatement, jamais une attente/reprise automatique qui risquerait de dupliquer.
          return { type: "needs_reconciliation" as const };
        }

        if (existingRecord && !existingRecord.isStalePending(now, STALE_PENDING_MS)) {
          // Un autre appelant exporte vers CETTE MÊME destination en ce moment — jamais un second
          // upload en parallèle vers la même cible.
          return { type: "wait" as const };
        }

        const record =
          existingRecord ?? ExternalFileExportRecord.reserve({ id: this.idGenerator.generate(), organizationId: command.organizationId, connectionId: key.connectionId, documentId: key.documentId, documentVersionId: key.documentVersionId, remoteContainerId: key.remoteContainerId, remoteFolderId: key.remoteFolderId, filename: key.filename, occurredAt: now });
        if (existingRecord) {
          existingRecord.reopen(now);
        }
        await this.exportRecordRepository.save(record);
        return { type: "proceed" as const, record };
      });

      if (outcome.type === "reuse") return { kind: "reuse", remoteFile: outcome.remoteFile };
      if (outcome.type === "needs_reconciliation") throw new ExternalFileExportNeedsReconciliationError();
      if (outcome.type === "proceed") return { kind: "proceed", record: outcome.record };
      await sleep(WAIT_POLL_INTERVAL_MS);
    }

    throw new ExternalFileOperationInProgressError();
  }
}
