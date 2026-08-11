import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ApiKeyNotFoundError } from "../../domain/errors";
import { assertHasIntegrationPermission, IntegrationPermission } from "../../domain/integration-permission";
import { API_KEY_REPOSITORY, type ApiKeyRepository } from "../ports/api-key.repository";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";

export type RevokeApiKeyCommand = Readonly<{ organizationId: string; actorId: string; actorRole: string; apiKeyId: string; requestId?: string | undefined }>;

/** Mission §12 — révocation immédiatement effective (le prochain appel authentifié avec cette clé
 *  échoue, voir `AuthenticateApiKeyUseCase.isUsable`). */
@Injectable()
export class RevokeApiKeyUseCase {
  constructor(
    @Inject(API_KEY_REPOSITORY) private readonly apiKeyRepository: ApiKeyRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: RevokeApiKeyCommand): Promise<void> {
    assertHasIntegrationPermission(command.actorRole, IntegrationPermission.ApiKeysManage);

    const apiKey = await this.apiKeyRepository.findById({ organizationId: command.organizationId, apiKeyId: command.apiKeyId });
    if (!apiKey) {
      throw new ApiKeyNotFoundError();
    }

    apiKey.revoke({ revokedBy: command.actorId, occurredAt: this.clock.now() });
    await this.apiKeyRepository.save(apiKey);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "ApiKeyRevoked",
      resourceType: "api_key",
      resourceId: apiKey.id,
      requestId: command.requestId,
      metadata: { keyPrefix: apiKey.keyPrefix },
    });
  }
}
