import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { assertHasConnectorPermission, ConnectorPermission } from "../../domain/connector-permission";
import { ExternalConnectionNotFoundError, ExternalConnectionNotUsableError, RemoteProviderError } from "../../domain/errors";
import { toExternalConnectionSummary, type ExternalConnectionSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { CONNECTOR_PROVIDER_ADAPTERS, type ConnectorProviderAdapterMap } from "../ports/connector-provider-adapter";
import { EXTERNAL_CONNECTION_REPOSITORY, type ExternalConnectionRepository } from "../ports/external-connection.repository";
import { callWithReactiveReauth } from "../services/call-with-reactive-reauth";
import { EnsureFreshAccessTokenService } from "../services/ensure-fresh-access-token.service";
import { getAdapter } from "../services/get-adapter";

export type TestConnectionQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; connectionId: string }>;

/**
 * Mission §6/§78 — vérifie qu'une connexion est RÉELLEMENT exploitable (credential disponible ->
 * token valide/rafraîchissable -> appel provider léger) sans effectuer d'import/export réel.
 * Réutilise `fetchAccountInfo` (déjà sur `ConnectorProviderAdapter` pour l'activation OAuth,
 * mission §1 : jamais une nouvelle méthode d'adapter juste pour ce besoin) — un appel `/me`
 * (Microsoft) ou userinfo (Google), le plus léger possible, jamais un import/export/sync complet.
 *
 * Ne LÈVE jamais d'erreur inattendue vers l'appelant HTTP : le but même d'un health-check est de
 * renvoyer un résultat clair (mission §34, "chaque action manuelle donne un résultat clair"), donc
 * chaque issue (token invalide -> REAUTH_REQUIRED déjà persisté par `EnsureFreshAccessTokenService`,
 * échec provider transitoire -> trace sanitisée) se traduit par un `ExternalConnectionSummary`
 * reflétant l'état réel, jamais une exception 5xx.
 */
@Injectable()
export class TestConnectionUseCase {
  constructor(
    @Inject(EXTERNAL_CONNECTION_REPOSITORY) private readonly connectionRepository: ExternalConnectionRepository,
    @Inject(CONNECTOR_PROVIDER_ADAPTERS) private readonly adapters: ConnectorProviderAdapterMap,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly ensureFreshAccessToken: EnsureFreshAccessTokenService,
  ) {}

  async execute(query: TestConnectionQuery): Promise<ExternalConnectionSummary> {
    assertHasConnectorPermission(query.actorRole, ConnectorPermission.Read);

    const connection = await this.connectionRepository.findById({ organizationId: query.organizationId, connectionId: query.connectionId });
    if (!connection) {
      throw new ExternalConnectionNotFoundError();
    }

    const adapter = getAdapter(this.adapters, connection.provider);

    try {
      await callWithReactiveReauth({
        connection,
        ensureFreshAccessToken: this.ensureFreshAccessToken,
        operation: (accessToken) => adapter.fetchAccountInfo(accessToken),
      });

      const now = this.clock.now();
      connection.recordSuccessfulSync(now);
      await this.connectionRepository.save(connection);

      await this.auditLogWriter.record({
        organizationId: query.organizationId,
        actorType: "USER",
        actorId: query.actorId,
        action: "connector.connection_tested",
        resourceType: "ExternalConnection",
        resourceId: connection.id,
        metadata: { provider: connection.provider, result: "ACTIVE" },
      });
      return toExternalConnectionSummary(connection);
    } catch (error) {
      if (error instanceof ExternalConnectionNotUsableError) {
        // `EnsureFreshAccessTokenService` a déjà persisté REAUTH_REQUIRED lui-même (sous son propre
        // verrou dédié, mission §11/§95) — jamais réécrire par-dessus avec l'état local
        // potentiellement obsolète, juste relire l'état réel.
        const refreshed = await this.connectionRepository.findById({ organizationId: query.organizationId, connectionId: query.connectionId });
        await this.auditLogWriter.record({
          organizationId: query.organizationId,
          actorType: "USER",
          actorId: query.actorId,
          action: "connector.connection_test_failed",
          resourceType: "ExternalConnection",
          resourceId: connection.id,
          metadata: { provider: connection.provider, result: "REAUTH_REQUIRED" },
        });
        return toExternalConnectionSummary(refreshed ?? connection);
      }

      // Échec provider non lié au token (permission/indisponibilité/etc.) : trace un échec
      // transitoire SANS passer en REAUTH_REQUIRED — le token lui-même reste valide.
      const now = this.clock.now();
      const reason = error instanceof RemoteProviderError ? error.message : "Connection test failed.";
      connection.recordTransientError({ reason, occurredAt: now });
      await this.connectionRepository.save(connection);

      await this.auditLogWriter.record({
        organizationId: query.organizationId,
        actorType: "USER",
        actorId: query.actorId,
        action: "connector.connection_test_failed",
        resourceType: "ExternalConnection",
        resourceId: connection.id,
        metadata: { provider: connection.provider, result: "ERROR" },
      });
      return toExternalConnectionSummary(connection);
    }
  }
}
