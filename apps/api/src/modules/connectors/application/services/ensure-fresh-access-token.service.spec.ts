import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Clock } from "../../../../shared-kernel/clock";
import { ConnectorProvider } from "../../domain/enums";
import { ExternalConnectionNotUsableError } from "../../domain/errors";
import { ExternalConnection } from "../../domain/external-connection.entity";
import { InMemoryExternalConnectionRepository } from "../../test-support/fakes";
import type { ConnectorProviderAdapter, ConnectorProviderAdapterMap, OAuthTokenResult } from "../ports/connector-provider-adapter";
import type { CredentialCipher } from "../ports/credential-cipher";
import { EnsureFreshAccessTokenService } from "./ensure-fresh-access-token.service";

class FixedClock implements Clock {
  constructor(private current: Date) {}
  now(): Date {
    return this.current;
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

class PlaintextCipher implements CredentialCipher {
  encrypt(plaintext: string): string {
    return `enc:${plaintext}`;
  }
  decrypt(ciphertext: string): string {
    return ciphertext.replace(/^enc:/, "");
  }
}

/** Simule la latence réseau d'un vrai `refreshAccessToken` — nécessaire pour forcer deux appels
 *  concurrents à réellement se chevaucher dans le temps plutôt que de s'exécuter séquentiellement
 *  par hasard sur la même micro-task queue. */
class CountingFakeAdapter implements ConnectorProviderAdapter {
  readonly provider = ConnectorProvider.Microsoft365;
  refreshCallCount = 0;
  shouldFail = false;
  private nextTokenSuffix = 0;

  buildAuthorizationUrl(): string {
    throw new Error("not used in this test");
  }
  async exchangeCodeForTokens(): Promise<OAuthTokenResult> {
    throw new Error("not used in this test");
  }
  async refreshAccessToken(refreshToken: string): Promise<OAuthTokenResult> {
    this.refreshCallCount += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    if (this.shouldFail) {
      throw new Error("refresh_token_revoked");
    }
    this.nextTokenSuffix += 1;
    return { accessToken: `new-access-${this.nextTokenSuffix}`, refreshToken: `${refreshToken}-rotated-${this.nextTokenSuffix}`, expiresInSeconds: 3600, scopes: [] };
  }
  async fetchAccountInfo(): Promise<never> {
    throw new Error("not used in this test");
  }
  async revokeToken(): Promise<void> {}
  async listContainers(): Promise<never> {
    throw new Error("not used in this test");
  }
  async listFolderChildren(): Promise<never> {
    throw new Error("not used in this test");
  }
  async downloadFile(): Promise<never> {
    throw new Error("not used in this test");
  }
  async uploadFile(): Promise<never> {
    throw new Error("not used in this test");
  }
  async createCalendarEvent(): Promise<never> {
    throw new Error("not used in this test");
  }
}

function buildActiveConnection(input: { organizationId: string; expiresAt: Date }): ExternalConnection {
  const connection = ExternalConnection.initiate({
    id: randomUUID(),
    organizationId: input.organizationId,
    provider: ConnectorProvider.Microsoft365,
    name: "Compte Microsoft principal",
    allowedClientAccountIds: [],
    createdBy: randomUUID(),
    occurredAt: new Date("2026-01-01T09:00:00Z"),
  });
  connection.activate({
    connectedBy: "user-1",
    scopes: ["Files.ReadWrite.All"],
    externalAccountId: "ext-1",
    externalTenantId: "tenant-1",
    externalAccountLabel: "user@example.com",
    encryptedAccessToken: "enc:stale-access",
    encryptedRefreshToken: "enc:refresh-token",
    expiresAt: input.expiresAt,
    occurredAt: new Date("2026-01-01T09:00:00Z"),
  });
  return connection;
}

describe("EnsureFreshAccessTokenService", () => {
  it("returns the stored access token unchanged when still fresh (no provider call)", async () => {
    const repository = new InMemoryExternalConnectionRepository();
    const adapter = new CountingFakeAdapter();
    const clock = new FixedClock(new Date("2026-01-01T10:00:00Z"));
    const connection = buildActiveConnection({ organizationId: randomUUID(), expiresAt: new Date("2026-01-01T12:00:00Z") });
    await repository.save(connection);
    const service = new EnsureFreshAccessTokenService(repository, adaptersMap(adapter), new PlaintextCipher(), clock);

    const token = await service.execute(connection);

    expect(token).toBe("stale-access");
    expect(adapter.refreshCallCount).toBe(0);
  });

  it("refreshes and persists REAUTH_REQUIRED when the refresh call fails definitively (mission §11)", async () => {
    const repository = new InMemoryExternalConnectionRepository();
    const adapter = new CountingFakeAdapter();
    adapter.shouldFail = true;
    const clock = new FixedClock(new Date("2026-01-01T10:00:00Z"));
    const connection = buildActiveConnection({ organizationId: randomUUID(), expiresAt: new Date("2026-01-01T10:00:30Z") });
    await repository.save(connection);
    const service = new EnsureFreshAccessTokenService(repository, adaptersMap(adapter), new PlaintextCipher(), clock);

    await expect(service.execute(connection)).rejects.toThrow(ExternalConnectionNotUsableError);

    const persisted = await repository.findById({ organizationId: connection.organizationId, connectionId: connection.id });
    expect(persisted?.status).toBe("REAUTH_REQUIRED");
  });

  it("mission §11/§95 — two concurrent callers on the same expired connection trigger only ONE refreshAccessToken call, never two", async () => {
    const repository = new InMemoryExternalConnectionRepository();
    const adapter = new CountingFakeAdapter();
    const clock = new FixedClock(new Date("2026-01-01T10:00:00Z"));
    const connection = buildActiveConnection({ organizationId: randomUUID(), expiresAt: new Date("2026-01-01T10:00:30Z") });
    await repository.save(connection);
    const service = new EnsureFreshAccessTokenService(repository, adaptersMap(adapter), new PlaintextCipher(), clock);

    const [tokenA, tokenB] = await Promise.all([service.execute(connection), service.execute(connection)]);

    expect(adapter.refreshCallCount).toBe(1);
    expect(tokenA).toBe(tokenB);
    expect(tokenA).toBe("new-access-1");

    const persisted = await repository.findById({ organizationId: connection.organizationId, connectionId: connection.id });
    expect(persisted?.status).toBe("ACTIVE");
    expect(persisted?.encryptedRefreshToken).toBe("enc:refresh-token-rotated-1");
  });
});

function adaptersMap(adapter: ConnectorProviderAdapter): ConnectorProviderAdapterMap {
  return new Map([[adapter.provider, adapter]]);
}
