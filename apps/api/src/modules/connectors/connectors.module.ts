import { Module } from "@nestjs/common";
import { DocumentsModule } from "../documents";
import { IdentityModule } from "../identity";
import { MembershipsModule } from "../memberships";
import { TendersModule } from "../tenders";
import { AUDIT_LOG_WRITER } from "./application/ports/audit-log-writer";
import { CALENDAR_SYNCED_EVENT_REPOSITORY } from "./application/ports/calendar-synced-event.repository";
import { CONNECTOR_PROVIDER_ADAPTERS, type ConnectorProviderAdapter, type ConnectorProviderAdapterMap } from "./application/ports/connector-provider-adapter";
import { CREDENTIAL_CIPHER } from "./application/ports/credential-cipher";
import { EXTERNAL_CONNECTION_REPOSITORY } from "./application/ports/external-connection.repository";
import { OAUTH_FLOW_STATE_REPOSITORY } from "./application/ports/oauth-flow-state.repository";
import { SYNC_CONFIGURATION_REPOSITORY } from "./application/ports/sync-configuration.repository";
import { BrowseRemoteFolderUseCase } from "./application/use-cases/browse-remote-folder.use-case";
import { CreateCalendarEventForTenderUseCase } from "./application/use-cases/create-calendar-event-for-tender.use-case";
import { DisconnectExternalConnectionUseCase } from "./application/use-cases/disconnect-external-connection.use-case";
import { ExportDocumentVersionUseCase } from "./application/use-cases/export-document-version.use-case";
import { ImportRemoteFileUseCase } from "./application/use-cases/import-remote-file.use-case";
import { InitiateOAuthConnectionUseCase } from "./application/use-cases/initiate-oauth-connection.use-case";
import { InitiateReauthorizationUseCase } from "./application/use-cases/initiate-reauthorization.use-case";
import { HandleOAuthCallbackUseCase } from "./application/use-cases/handle-oauth-callback.use-case";
import { ListExternalConnectionsUseCase } from "./application/use-cases/list-external-connections.use-case";
import { EnsureFreshAccessTokenService } from "./application/services/ensure-fresh-access-token.service";
import { OAuthFlowStarterService } from "./application/services/oauth-flow-starter.service";
import { ConnectorProvider } from "./domain/enums";
import { AesGcmCredentialCipher } from "./infrastructure/aes-gcm-credential.cipher";
import { GoogleWorkspaceAdapter } from "./infrastructure/google-workspace.adapter";
import { MicrosoftGraphAdapter } from "./infrastructure/microsoft-graph.adapter";
import { PrismaAuditLogWriter } from "./infrastructure/prisma-audit-log.writer";
import { PrismaCalendarSyncedEventRepository } from "./infrastructure/prisma-calendar-synced-event.repository";
import { PrismaExternalConnectionRepository } from "./infrastructure/prisma-external-connection.repository";
import { PrismaOAuthFlowStateRepository } from "./infrastructure/prisma-oauth-flow-state.repository";
import { PrismaSyncConfigurationRepository } from "./infrastructure/prisma-sync-configuration.repository";
import { ConnectorsController } from "./interfaces/http/connectors.controller";
import { ConnectorsOAuthCallbackController } from "./interfaces/http/connectors-oauth-callback.controller";

/**
 * V2 Sprint 19 (Connecteurs Microsoft 365 & Google Workspace) — module dédié, distinct
 * d'`integrations` (Sprint 16, direction inverse : TenderOS EXPOSE une API, ici TenderOS CONSOMME
 * des API externes via OAuth — décision AskUserQuestion validée). Importe `DocumentsModule`/
 * `TendersModule` uniquement pour leurs use-cases réexportés en lecture/écriture déjà RBAC-gated
 * (`CreateDocumentWithFirstVersionUseCase`, `AddDocumentVersionUseCase`,
 * `AttachDocumentToTenderUseCase`, `DownloadDocumentVersionUseCase`, `GetTenderUseCase`) — jamais
 * un second chemin de création/lecture documentaire (mission §19/§51). N'importe PAS `OutboxModule` :
 * ce module ne produit aucun événement Outbox ce sprint (aucune sync automatique, décision validée).
 */
@Module({
  imports: [IdentityModule, MembershipsModule, TendersModule, DocumentsModule],
  controllers: [ConnectorsController, ConnectorsOAuthCallbackController],
  providers: [
    InitiateOAuthConnectionUseCase,
    InitiateReauthorizationUseCase,
    HandleOAuthCallbackUseCase,
    ListExternalConnectionsUseCase,
    DisconnectExternalConnectionUseCase,
    BrowseRemoteFolderUseCase,
    ImportRemoteFileUseCase,
    ExportDocumentVersionUseCase,
    CreateCalendarEventForTenderUseCase,
    OAuthFlowStarterService,
    EnsureFreshAccessTokenService,

    { provide: EXTERNAL_CONNECTION_REPOSITORY, useClass: PrismaExternalConnectionRepository },
    { provide: OAUTH_FLOW_STATE_REPOSITORY, useClass: PrismaOAuthFlowStateRepository },
    { provide: SYNC_CONFIGURATION_REPOSITORY, useClass: PrismaSyncConfigurationRepository },
    { provide: CALENDAR_SYNCED_EVENT_REPOSITORY, useClass: PrismaCalendarSyncedEventRepository },
    { provide: AUDIT_LOG_WRITER, useClass: PrismaAuditLogWriter },
    { provide: CREDENTIAL_CIPHER, useClass: AesGcmCredentialCipher },
    {
      provide: CONNECTOR_PROVIDER_ADAPTERS,
      useFactory: (microsoft: MicrosoftGraphAdapter, google: GoogleWorkspaceAdapter): ConnectorProviderAdapterMap =>
        new Map<ConnectorProvider, ConnectorProviderAdapter>([
          [ConnectorProvider.Microsoft365, microsoft],
          [ConnectorProvider.GoogleWorkspace, google],
        ]),
      inject: [MicrosoftGraphAdapter, GoogleWorkspaceAdapter],
    },
    MicrosoftGraphAdapter,
    GoogleWorkspaceAdapter,
  ],
})
export class ConnectorsModule {}
