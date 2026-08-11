import type { ApiKey as ApiKeyRow } from "@prisma/client";
import { ApiKey } from "../domain/api-key.entity";
import type { ApiKeyScope } from "../domain/enums";

export function toDomainApiKey(row: ApiKeyRow): ApiKey {
  return ApiKey.rehydrate({
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    keyPrefix: row.keyPrefix,
    keyHash: row.keyHash,
    scopes: row.scopes as ApiKeyScope[],
    allowedClientAccountIds: row.allowedClientAccountIds,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt ?? undefined,
    expiresAt: row.expiresAt ?? undefined,
    revokedAt: row.revokedAt ?? undefined,
    revokedBy: row.revokedBy ?? undefined,
  });
}

export function toApiKeyRow(key: ApiKey): ApiKeyRow {
  return {
    id: key.id,
    organizationId: key.organizationId,
    name: key.name,
    keyPrefix: key.keyPrefix,
    keyHash: key.keyHash,
    scopes: [...key.scopes],
    allowedClientAccountIds: [...key.allowedClientAccountIds],
    createdBy: key.createdBy,
    createdAt: key.createdAt,
    lastUsedAt: key.lastUsedAt ?? null,
    expiresAt: key.expiresAt ?? null,
    revokedAt: key.revokedAt ?? null,
    revokedBy: key.revokedBy ?? null,
  };
}
