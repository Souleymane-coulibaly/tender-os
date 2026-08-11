import type { ApiKey } from "../../domain/api-key.entity";

export interface ApiKeyRepository {
  create(key: ApiKey): Promise<void>;
  save(key: ApiKey): Promise<void>;
  findById(input: { organizationId: string; apiKeyId: string }): Promise<ApiKey | null>;
  /** Lookup par préfixe SEUL (mission — au moment de l'authentification, l'organisation n'est pas
   *  encore connue ; `keyPrefix` est unique globalement, voir migration). */
  findByPrefix(keyPrefix: string): Promise<ApiKey | null>;
  listByOrganization(input: { organizationId: string }): Promise<readonly ApiKey[]>;
}

export const API_KEY_REPOSITORY = Symbol("API_KEY_REPOSITORY");
