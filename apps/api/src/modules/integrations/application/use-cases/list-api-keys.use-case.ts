import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { assertHasIntegrationPermission, IntegrationPermission } from "../../domain/integration-permission";
import { API_KEY_REPOSITORY, type ApiKeyRepository } from "../ports/api-key.repository";
import { toApiKeySummary, type ApiKeySummary } from "../dtos";

export type ListApiKeysQuery = Readonly<{ organizationId: string; actorRole: string }>;

/** Mission §98 — ne renvoie JAMAIS la clé complète ni `keyHash`, uniquement `toApiKeySummary`. */
@Injectable()
export class ListApiKeysUseCase {
  constructor(
    @Inject(API_KEY_REPOSITORY) private readonly apiKeyRepository: ApiKeyRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(query: ListApiKeysQuery): Promise<ApiKeySummary[]> {
    assertHasIntegrationPermission(query.actorRole, IntegrationPermission.Read);
    const keys = await this.apiKeyRepository.listByOrganization({ organizationId: query.organizationId });
    const now = this.clock.now();
    return keys.map((key) => toApiKeySummary(key, now));
  }
}
