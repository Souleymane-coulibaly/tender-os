import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import type { ApiKeyScope } from "../../domain/enums";
import { ApiKeyAuthenticationFailedError } from "../../domain/errors";
import { extractApiKeyPrefix, verifyApiKeySecret } from "../../domain/services/api-key-secret";
import { API_KEY_REPOSITORY, type ApiKeyRepository } from "../ports/api-key.repository";

export type ApiKeyPrincipal = Readonly<{
  apiKeyId: string;
  organizationId: string;
  scopes: readonly ApiKeyScope[];
  /** Mission §17/§18 — reflète directement `ApiKey.isClientAllowed` : vide = pas de restriction
   *  supplémentaire, sinon narrowing strict. Même FORME que `ListAccessibleClientsResult` (Sprint
   *  15) pour pouvoir alimenter `restrictToClientAccountIds` sans transformation. */
  allowedClientAccountIds: readonly string[];
}>;

/**
 * Mission §96/§97/§101 — un secret invalide, une clé révoquée, expirée, ou inconnue produisent
 * TOUS la MÊME erreur générique (`ApiKeyAuthenticationFailedError`, anti-énumération), jamais un
 * message distinguant "clé inconnue" de "clé expirée". Enregistre `lastUsedAt` sur authentification
 * réussie (mission §10 "lastUsedAt").
 */
@Injectable()
export class AuthenticateApiKeyUseCase {
  constructor(
    @Inject(API_KEY_REPOSITORY) private readonly apiKeyRepository: ApiKeyRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(fullKey: string): Promise<ApiKeyPrincipal> {
    const prefix = extractApiKeyPrefix(fullKey);
    if (!prefix) {
      throw new ApiKeyAuthenticationFailedError();
    }

    const apiKey = await this.apiKeyRepository.findByPrefix(prefix);
    if (!apiKey || !verifyApiKeySecret(fullKey, apiKey.keyHash)) {
      throw new ApiKeyAuthenticationFailedError();
    }

    const now = this.clock.now();
    if (!apiKey.isUsable(now)) {
      throw new ApiKeyAuthenticationFailedError();
    }

    apiKey.recordUsage(now);
    await this.apiKeyRepository.save(apiKey);

    return { apiKeyId: apiKey.id, organizationId: apiKey.organizationId, scopes: apiKey.scopes, allowedClientAccountIds: apiKey.allowedClientAccountIds };
  }
}
