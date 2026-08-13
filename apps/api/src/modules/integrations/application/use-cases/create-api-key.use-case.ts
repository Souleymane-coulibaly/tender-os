import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { assertEntitlementFeature, ENTITLEMENT_SERVICE, EntitlementFeature, type EntitlementService } from "../../../billing";
import { GetClientAccountUseCase } from "../../../client-portfolio";
import { ApiKey } from "../../domain/api-key.entity";
import { isApiKeyScope, type ApiKeyScope } from "../../domain/enums";
import { InvalidApiKeyClientScopeError, InvalidApiKeyScopeError } from "../../domain/errors";
import { assertHasIntegrationPermission, IntegrationPermission } from "../../domain/integration-permission";
import { generateApiKey } from "../../domain/services/api-key-secret";
import { API_KEY_REPOSITORY, type ApiKeyRepository } from "../ports/api-key.repository";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";

export type CreateApiKeyCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  name: string;
  scopes: readonly string[];
  allowedClientAccountIds?: readonly string[] | undefined;
  expiresAt?: string | undefined;
  requestId?: string | undefined;
}>;

export type CreateApiKeyResult = Readonly<{ apiKey: ApiKey; fullKey: string }>;

/** Mission §10/§11/§14/§16/§17 — la clé brute (`fullKey`) n'est retournée QU'ICI, jamais
 *  persistée, jamais rejournalisée. Scopes et restriction client validés AVANT toute écriture
 *  (mission §18 : jamais un `clientAccountId` d'une autre organisation accepté silencieusement).
 *
 *  Correctif audit Codex 22A (P1-01) — l'API publique (PUBLIC_API) est une fonctionnalité
 *  différenciante du catalogue commercial (Enterprise uniquement, mission Sprint 22 §16/§18) :
 *  `assertEntitlementFeature` s'exécute APRÈS le RBAC (mission §23 "Entitlement AND RBAC", jamais
 *  l'un à la place de l'autre) mais AVANT toute écriture, pour qu'un Starter/Business avec RBAC
 *  suffisant ne puisse plus créer de clé API par appel direct (mission §16 "ne pas casser
 *  techniquement l'Integration Hub" : les clés Enterprise déjà émises restent inchangées, seule la
 *  CRÉATION est gatée). */
@Injectable()
export class CreateApiKeyUseCase {
  constructor(
    @Inject(API_KEY_REPOSITORY) private readonly apiKeyRepository: ApiKeyRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ENTITLEMENT_SERVICE) private readonly entitlementService: EntitlementService,
    private readonly getClientAccountUseCase: GetClientAccountUseCase,
  ) {}

  async execute(command: CreateApiKeyCommand): Promise<CreateApiKeyResult> {
    assertHasIntegrationPermission(command.actorRole, IntegrationPermission.ApiKeysManage);
    await assertEntitlementFeature(this.entitlementService, command.organizationId, EntitlementFeature.PublicApi);

    const scopes: ApiKeyScope[] = [];
    for (const scope of command.scopes) {
      if (!isApiKeyScope(scope)) {
        throw new InvalidApiKeyScopeError(scope);
      }
      scopes.push(scope);
    }

    const allowedClientAccountIds = command.allowedClientAccountIds ?? [];
    await this.assertClientAccountIdsBelongToOrganization({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, clientAccountIds: allowedClientAccountIds });

    const generated = generateApiKey();
    const occurredAt = this.clock.now();

    const apiKey = ApiKey.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      name: command.name,
      keyPrefix: generated.keyPrefix,
      keyHash: generated.keyHash,
      scopes,
      allowedClientAccountIds,
      createdBy: command.actorId,
      occurredAt,
      expiresAt: command.expiresAt ? new Date(command.expiresAt) : undefined,
    });

    await this.apiKeyRepository.create(apiKey);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "ApiKeyCreated",
      resourceType: "api_key",
      resourceId: apiKey.id,
      requestId: command.requestId,
      metadata: { name: command.name, scopes, keyPrefix: generated.keyPrefix, clientScoped: allowedClientAccountIds.length > 0 },
    });

    return { apiKey, fullKey: generated.fullKey };
  }

  private async assertClientAccountIdsBelongToOrganization(input: { organizationId: string; actorId: string; actorRole: string; clientAccountIds: readonly string[] }): Promise<void> {
    for (const clientAccountId of input.clientAccountIds) {
      try {
        await this.getClientAccountUseCase.execute({ organizationId: input.organizationId, clientAccountId, actorId: input.actorId, actorRole: input.actorRole });
      } catch {
        throw new InvalidApiKeyClientScopeError();
      }
    }
  }
}
