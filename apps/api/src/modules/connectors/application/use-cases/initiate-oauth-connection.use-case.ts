import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { assertEntitlementFeature, ENTITLEMENT_SERVICE, EntitlementFeature, type EntitlementService } from "../../../billing";
import { assertHasConnectorPermission, ConnectorPermission } from "../../domain/connector-permission";
import type { ConnectorProvider } from "../../domain/enums";
import { ExternalConnectionAlreadyExistsError } from "../../domain/errors";
import { ExternalConnection } from "../../domain/external-connection.entity";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { EXTERNAL_CONNECTION_REPOSITORY, type ExternalConnectionRepository } from "../ports/external-connection.repository";
import { OAuthFlowStarterService } from "../services/oauth-flow-starter.service";

export type InitiateOAuthConnectionCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  provider: ConnectorProvider;
  name: string;
  allowedClientAccountIds?: readonly string[] | undefined;
}>;

export type InitiateOAuthConnectionResult = Readonly<{ authorizationUrl: string }>;

/**
 * Mission §6 — nouvelle connexion. Crée la ligne `ExternalConnection` en PENDING dès l'initiation
 * (mission §77 "ConnectionCreated" doit pouvoir être audité même si l'utilisateur n'achève jamais
 * le consentement provider) plutôt qu'à l'issue du callback — le callback (`HandleOAuthCallback
 * UseCase`) ne fait qu'`activate()` cette ligne existante, jamais n'en crée une nouvelle.
 *
 * Correctif audit Codex 22A (P1-01) — les connecteurs externes (Microsoft 365/Google Workspace,
 * Sprint 19) correspondent à AUTOMATION_CONNECTORS dans le catalogue commercial (Enterprise
 * uniquement, mission Sprint 22 §16). Gaté ici, jamais au niveau du callback OAuth
 * (`HandleOAuthCallbackUseCase`) : une connexion déjà initiée doit pouvoir être activée même si le
 * plan a changé entre-temps (le callback n'est jamais un second point de décision commerciale).
 */
@Injectable()
export class InitiateOAuthConnectionUseCase {
  constructor(
    @Inject(EXTERNAL_CONNECTION_REPOSITORY) private readonly connectionRepository: ExternalConnectionRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(ENTITLEMENT_SERVICE) private readonly entitlementService: EntitlementService,
    private readonly flowStarter: OAuthFlowStarterService,
  ) {}

  async execute(command: InitiateOAuthConnectionCommand): Promise<InitiateOAuthConnectionResult> {
    assertHasConnectorPermission(command.actorRole, ConnectorPermission.Manage);
    await assertEntitlementFeature(this.entitlementService, command.organizationId, EntitlementFeature.AutomationConnectors);

    const existing = await this.connectionRepository.findActiveByOrganizationAndProvider({ organizationId: command.organizationId, provider: command.provider });
    if (existing) {
      throw new ExternalConnectionAlreadyExistsError();
    }

    const occurredAt = this.clock.now();
    const connection = ExternalConnection.initiate({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      provider: command.provider,
      name: command.name,
      allowedClientAccountIds: command.allowedClientAccountIds ?? [],
      createdBy: command.actorId,
      occurredAt,
    });
    await this.connectionRepository.save(connection);

    const authorizationUrl = await this.flowStarter.start({ organizationId: command.organizationId, userId: command.actorId, provider: command.provider, connectionId: undefined, occurredAt });

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "connector.connection_initiated",
      resourceType: "ExternalConnection",
      resourceId: connection.id,
      metadata: { provider: command.provider },
    });

    return { authorizationUrl };
  }
}
