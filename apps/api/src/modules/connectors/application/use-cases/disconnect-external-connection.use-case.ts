import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { assertHasConnectorPermission, ConnectorPermission } from "../../domain/connector-permission";
import { ExternalConnectionNotFoundError } from "../../domain/errors";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { CONNECTOR_PROVIDER_ADAPTERS, type ConnectorProviderAdapterMap } from "../ports/connector-provider-adapter";
import { CREDENTIAL_CIPHER, type CredentialCipher } from "../ports/credential-cipher";
import { EXTERNAL_CONNECTION_REPOSITORY, type ExternalConnectionRepository } from "../ports/external-connection.repository";
import { getAdapter } from "../services/get-adapter";

export type DisconnectExternalConnectionCommand = Readonly<{ organizationId: string; actorId: string; actorRole: string; connectionId: string }>;

/**
 * Mission §12 — déconnexion. Révocation best-effort côté provider (ne bloque jamais la
 * déconnexion locale, mission §80), puis `ExternalConnection.revoke()` qui efface réellement les
 * credentials chiffrés (jamais juste un changement de statut, voir l'entité).
 */
@Injectable()
export class DisconnectExternalConnectionUseCase {
  constructor(
    @Inject(EXTERNAL_CONNECTION_REPOSITORY) private readonly connectionRepository: ExternalConnectionRepository,
    @Inject(CONNECTOR_PROVIDER_ADAPTERS) private readonly adapters: ConnectorProviderAdapterMap,
    @Inject(CREDENTIAL_CIPHER) private readonly credentialCipher: CredentialCipher,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: DisconnectExternalConnectionCommand): Promise<void> {
    assertHasConnectorPermission(command.actorRole, ConnectorPermission.Manage);

    const connection = await this.connectionRepository.findById({ organizationId: command.organizationId, connectionId: command.connectionId });
    if (!connection) {
      throw new ExternalConnectionNotFoundError();
    }

    if (connection.encryptedRefreshToken !== undefined) {
      const adapter = getAdapter(this.adapters, connection.provider);
      const refreshToken = this.credentialCipher.decrypt(connection.encryptedRefreshToken);
      await adapter.revokeToken(refreshToken).catch(() => undefined);
    }

    const occurredAt = this.clock.now();
    connection.revoke({ revokedBy: command.actorId, occurredAt });
    await this.connectionRepository.save(connection);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "connector.connection_disconnected",
      resourceType: "ExternalConnection",
      resourceId: connection.id,
      metadata: { provider: connection.provider },
    });
  }
}
