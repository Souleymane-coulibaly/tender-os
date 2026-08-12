import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { getRequiredEnv } from "../../../../shared-kernel/env";
import { AttachDocumentToTenderUseCase, CreateDocumentWithFirstVersionUseCase, AddDocumentVersionUseCase, DocumentDomain, DocumentOrigin, type DocumentSummary } from "../../../documents";
import { assertHasConnectorPermission, ConnectorPermission } from "../../domain/connector-permission";
import { ExternalConnectionClientNotAllowedError, ExternalConnectionNotFoundError } from "../../domain/errors";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { CONNECTOR_PROVIDER_ADAPTERS, type ConnectorProviderAdapterMap } from "../ports/connector-provider-adapter";
import { EXTERNAL_CONNECTION_REPOSITORY, type ExternalConnectionRepository } from "../ports/external-connection.repository";
import { EnsureFreshAccessTokenService } from "../services/ensure-fresh-access-token.service";
import { getAdapter } from "../services/get-adapter";

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

/**
 * Mission §19 — SharePoint/OneDrive/Drive -> Document/DocumentVersion. Réutilise TEL QUEL les
 * use-cases `documents` existants (jamais un second stockage documentaire, mission §19) : la
 * vérification Tender+ClientAccess de la cible d'attachement reste entièrement à la charge
 * d'`AttachDocumentToTenderUseCase` (via `GetTenderUseCase`), jamais dupliquée ici (mission §50).
 * Le narrowing `allowedClientAccountIds` de la CONNEXION (mission §49/§52) est vérifié en plus,
 * AVANT tout appel provider — une connexion restreinte au Client A ne doit jamais servir à
 * importer quoi que ce soit dans le contexte du Client B, même si l'acteur y a par ailleurs accès.
 */
@Injectable()
export class ImportRemoteFileUseCase {
  constructor(
    @Inject(EXTERNAL_CONNECTION_REPOSITORY) private readonly connectionRepository: ExternalConnectionRepository,
    @Inject(CONNECTOR_PROVIDER_ADAPTERS) private readonly adapters: ConnectorProviderAdapterMap,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly ensureFreshAccessToken: EnsureFreshAccessTokenService,
    private readonly createDocumentWithFirstVersion: CreateDocumentWithFirstVersionUseCase,
    private readonly addDocumentVersion: AddDocumentVersionUseCase,
    private readonly attachDocumentToTender: AttachDocumentToTenderUseCase,
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

    const accessToken = await this.ensureFreshAccessToken.execute(connection);
    const adapter = getAdapter(this.adapters, connection.provider);
    const downloaded = await adapter.downloadFile(accessToken, { containerId: command.containerId, fileId: command.fileId, mimeType: command.mimeType });

    const file = { buffer: downloaded.buffer, originalFilename: downloaded.filename, mimeType: downloaded.mimeType };
    const maxFileSizeBytes = maxDocumentFileSizeBytes();

    const document = command.targetDocumentId
      ? await this.addDocumentVersion.execute({ organizationId: command.organizationId, documentId: command.targetDocumentId, actorId: command.actorId, actorRole: command.actorRole, file, maxFileSizeBytes })
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

    if (command.tenderId && !command.targetDocumentId) {
      await this.attachDocumentToTender.execute({ organizationId: command.organizationId, documentId: document.id, tenderId: command.tenderId, actorId: command.actorId, actorRole: command.actorRole });
    }

    const occurredAt = this.clock.now();
    connection.recordSuccessfulSync(occurredAt);
    await this.connectionRepository.save(connection);

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
  }
}
