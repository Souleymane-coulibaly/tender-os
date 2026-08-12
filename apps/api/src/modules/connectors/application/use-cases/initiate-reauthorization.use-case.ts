import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { assertHasConnectorPermission, ConnectorPermission } from "../../domain/connector-permission";
import { ExternalConnectionNotFoundError, ExternalConnectionRevokedError } from "../../domain/errors";
import { ConnectionStatus } from "../../domain/enums";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { EXTERNAL_CONNECTION_REPOSITORY, type ExternalConnectionRepository } from "../ports/external-connection.repository";
import { OAuthFlowStarterService } from "../services/oauth-flow-starter.service";

export type InitiateReauthorizationCommand = Readonly<{ organizationId: string; actorId: string; actorRole: string; connectionId: string }>;
export type InitiateReauthorizationResult = Readonly<{ authorizationUrl: string }>;

/**
 * Mission §69 — "Connexion expirée -> Reconnecter" : réutilise la MÊME ligne `ExternalConnection`
 * (jamais une seconde ligne pour le même provider, l'index partiel `external_connections_org_
 * provider_active_uidx` refuserait de toute façon PENDING+REAUTH_REQUIRED simultanés). Utilisable
 * aussi bien depuis REAUTH_REQUIRED que depuis ACTIVE (re-consentement volontaire, ex. après un
 * changement de scopes) — jamais depuis REVOKED, qui exige une nouvelle connexion explicite.
 */
@Injectable()
export class InitiateReauthorizationUseCase {
  constructor(
    @Inject(EXTERNAL_CONNECTION_REPOSITORY) private readonly connectionRepository: ExternalConnectionRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly flowStarter: OAuthFlowStarterService,
  ) {}

  async execute(command: InitiateReauthorizationCommand): Promise<InitiateReauthorizationResult> {
    assertHasConnectorPermission(command.actorRole, ConnectorPermission.Manage);

    const connection = await this.connectionRepository.findById({ organizationId: command.organizationId, connectionId: command.connectionId });
    if (!connection) {
      throw new ExternalConnectionNotFoundError();
    }
    if (connection.status === ConnectionStatus.Revoked) {
      throw new ExternalConnectionRevokedError();
    }

    const occurredAt = this.clock.now();
    const authorizationUrl = await this.flowStarter.start({ organizationId: command.organizationId, userId: command.actorId, provider: connection.provider, connectionId: connection.id, occurredAt });

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "connector.reauthorization_initiated",
      resourceType: "ExternalConnection",
      resourceId: connection.id,
      metadata: { provider: connection.provider },
    });

    return { authorizationUrl };
  }
}
