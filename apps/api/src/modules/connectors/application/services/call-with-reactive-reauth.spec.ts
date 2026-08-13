import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { ConnectorProvider, ProviderErrorCode } from "../../domain/enums";
import { RemoteProviderError } from "../../domain/errors";
import { ExternalConnection } from "../../domain/external-connection.entity";
import { callWithReactiveReauth } from "./call-with-reactive-reauth";
import type { EnsureFreshAccessTokenService } from "./ensure-fresh-access-token.service";

function buildConnection(): ExternalConnection {
  const connection = ExternalConnection.initiate({
    id: randomUUID(),
    organizationId: randomUUID(),
    provider: ConnectorProvider.Microsoft365,
    name: "Compte Microsoft principal",
    allowedClientAccountIds: [],
    createdBy: randomUUID(),
    occurredAt: new Date(),
  });
  connection.activate({
    connectedBy: "user-1",
    scopes: [],
    externalAccountId: "ext-1",
    externalTenantId: undefined,
    externalAccountLabel: undefined,
    encryptedAccessToken: "enc:access",
    encryptedRefreshToken: "enc:refresh",
    expiresAt: undefined,
    occurredAt: new Date(),
  });
  return connection;
}

describe("callWithReactiveReauth", () => {
  it("mission §14 — on a first-attempt AUTH_ERROR, forces a refresh and retries the operation exactly once, succeeding on the second try", async () => {
    const connection = buildConnection();
    const execute = vi.fn().mockResolvedValueOnce("stale-token").mockResolvedValueOnce("fresh-token");
    const ensureFreshAccessToken = { execute } as unknown as EnsureFreshAccessTokenService;

    const operation = vi
      .fn()
      .mockImplementationOnce(async () => {
        throw new RemoteProviderError({ providerErrorCode: ProviderErrorCode.AuthError, retryable: false });
      })
      .mockImplementationOnce(async (accessToken: string) => `result-with-${accessToken}`);

    const result = await callWithReactiveReauth({ connection, ensureFreshAccessToken, operation });

    expect(result).toBe("result-with-fresh-token");
    expect(operation).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenNthCalledWith(2, connection, { staleAccessToken: "stale-token" });
  });

  it("mission §19 — never loops: a second consecutive AUTH_ERROR after the forced refresh propagates instead of retrying again", async () => {
    const connection = buildConnection();
    const execute = vi.fn().mockResolvedValueOnce("stale-token").mockResolvedValueOnce("still-bad-token");
    const ensureFreshAccessToken = { execute } as unknown as EnsureFreshAccessTokenService;

    const authError = new RemoteProviderError({ providerErrorCode: ProviderErrorCode.AuthError, retryable: false });
    const operation = vi.fn().mockRejectedValue(authError);

    await expect(callWithReactiveReauth({ connection, ensureFreshAccessToken, operation })).rejects.toBe(authError);
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("does not retry on a non-auth error (e.g. NOT_FOUND) — propagates immediately", async () => {
    const connection = buildConnection();
    const execute = vi.fn().mockResolvedValueOnce("token");
    const ensureFreshAccessToken = { execute } as unknown as EnsureFreshAccessTokenService;

    const notFoundError = new RemoteProviderError({ providerErrorCode: ProviderErrorCode.NotFound, retryable: false });
    const operation = vi.fn().mockRejectedValue(notFoundError);

    await expect(callWithReactiveReauth({ connection, ensureFreshAccessToken, operation })).rejects.toBe(notFoundError);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
