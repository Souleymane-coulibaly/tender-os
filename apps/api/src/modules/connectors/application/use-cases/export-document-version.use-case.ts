import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { DownloadDocumentVersionUseCase } from "../../../documents";
import { assertHasConnectorPermission, ConnectorPermission } from "../../domain/connector-permission";
import { ExternalConnectionClientNotAllowedError, ExternalConnectionNotFoundError, ExportTargetNotFoundError } from "../../domain/errors";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { CONNECTOR_PROVIDER_ADAPTERS, type ConnectorProviderAdapterMap } from "../ports/connector-provider-adapter";
import type { RemoteFile } from "../ports/connector-provider-adapter";
import { EXTERNAL_CONNECTION_REPOSITORY, type ExternalConnectionRepository } from "../ports/external-connection.repository";
import { EnsureFreshAccessTokenService } from "../services/ensure-fresh-access-token.service";
import { getAdapter } from "../services/get-adapter";

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

/**
 * Mission §20/§21/§51/§52 — TenderOS -> SharePoint/OneDrive/Drive. Réutilise
 * `DownloadDocumentVersionUseCase` (mission §51 : la lecture reste entièrement gouvernée par les
 * règles `documents` — permission + appartenance Tender/ClientAccess, jamais dupliquées ici),
 * PUIS vérifie en plus le narrowing de la CONNEXION (mission §52, même motif que l'import) — les
 * deux couches d'autorisation sont indépendantes et toutes deux nécessaires.
 */
@Injectable()
export class ExportDocumentVersionUseCase {
  constructor(
    @Inject(EXTERNAL_CONNECTION_REPOSITORY) private readonly connectionRepository: ExternalConnectionRepository,
    @Inject(CONNECTOR_PROVIDER_ADAPTERS) private readonly adapters: ConnectorProviderAdapterMap,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
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

    const download = await this.downloadDocumentVersion.execute({
      organizationId: command.organizationId,
      documentId: command.documentId,
      versionId: command.versionId,
      actorId: command.actorId,
      actorRole: command.actorRole,
    });
    if (download.kind !== "stream") {
      // Mission §42/§43 — un stockage à URL signée (futur R2) devrait être téléchargé côté serveur
      // avant réexport, jamais transmis tel quel à un provider tiers non authentifié pour cette URL.
      throw new ExportTargetNotFoundError();
    }

    const accessToken = await this.ensureFreshAccessToken.execute(connection);
    const adapter = getAdapter(this.adapters, connection.provider);
    const content = await streamToBuffer(download.stream);
    const uploaded = await adapter.uploadFile(accessToken, {
      containerId: command.containerId,
      folderId: command.folderId,
      filename: command.filename ?? download.filename,
      content,
      mimeType: download.contentType,
    });

    const occurredAt = this.clock.now();
    connection.recordSuccessfulSync(occurredAt);
    await this.connectionRepository.save(connection);

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
  }
}
