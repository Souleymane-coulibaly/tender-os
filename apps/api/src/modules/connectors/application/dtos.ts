import type { ExternalConnection } from "../domain/external-connection.entity";

/** Mission §61 — jamais `encryptedAccessToken`/`encryptedRefreshToken` dans un DTO exposé à
 *  l'interface HTTP, même chiffrés. */
export type ExternalConnectionSummary = Readonly<{
  id: string;
  provider: string;
  name: string;
  status: string;
  scopes: readonly string[];
  externalAccountLabel?: string | undefined;
  externalTenantId?: string | undefined;
  allowedClientAccountIds: readonly string[];
  lastRefreshAt?: string | undefined;
  lastSuccessfulSyncAt?: string | undefined;
  lastError?: string | undefined;
  connectedBy: string;
  createdAt: string;
  updatedAt: string;
}>;

export function toExternalConnectionSummary(connection: ExternalConnection): ExternalConnectionSummary {
  return {
    id: connection.id,
    provider: connection.provider,
    name: connection.name,
    status: connection.status,
    scopes: connection.scopes,
    externalAccountLabel: connection.externalAccountLabel,
    externalTenantId: connection.externalTenantId,
    allowedClientAccountIds: connection.allowedClientAccountIds,
    lastRefreshAt: connection.lastRefreshAt?.toISOString(),
    lastSuccessfulSyncAt: connection.lastSuccessfulSyncAt?.toISOString(),
    lastError: connection.lastError,
    connectedBy: connection.connectedBy,
    createdAt: connection.createdAt.toISOString(),
    updatedAt: connection.updatedAt.toISOString(),
  };
}
