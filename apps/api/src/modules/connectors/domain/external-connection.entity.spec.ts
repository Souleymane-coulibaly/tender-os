import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ConnectionStatus, ConnectorProvider } from "./enums";
import { ExternalConnectionRevokedError } from "./errors";
import { ExternalConnection } from "./external-connection.entity";

function initiate(overrides?: Partial<{ allowedClientAccountIds: readonly string[] }>) {
  return ExternalConnection.initiate({
    id: randomUUID(),
    organizationId: randomUUID(),
    provider: ConnectorProvider.Microsoft365,
    name: "Compte Microsoft principal",
    allowedClientAccountIds: overrides?.allowedClientAccountIds ?? [],
    createdBy: randomUUID(),
    occurredAt: new Date("2026-01-01T10:00:00Z"),
  });
}

describe("ExternalConnection", () => {
  it("starts PENDING with no credentials", () => {
    const connection = initiate();
    expect(connection.status).toBe(ConnectionStatus.Pending);
    expect(connection.isUsable()).toBe(false);
    expect(connection.encryptedAccessToken).toBeUndefined();
  });

  it("activate() transitions PENDING -> ACTIVE and stores the OAuth-derived fields", () => {
    const connection = initiate();
    connection.activate({
      connectedBy: "user-1",
      scopes: ["Files.ReadWrite.All"],
      externalAccountId: "ext-1",
      externalTenantId: "tenant-1",
      externalAccountLabel: "user@example.com",
      encryptedAccessToken: "enc:access",
      encryptedRefreshToken: "enc:refresh",
      expiresAt: new Date("2026-01-01T11:00:00Z"),
      occurredAt: new Date("2026-01-01T10:05:00Z"),
    });

    expect(connection.status).toBe(ConnectionStatus.Active);
    expect(connection.isUsable()).toBe(true);
    expect(connection.externalAccountLabel).toBe("user@example.com");
  });

  it("BLOQUANT — activate() also works from REAUTH_REQUIRED (mission §11/§69, reconnect reuses the same row)", () => {
    const connection = initiate();
    connection.activate({ connectedBy: "u", scopes: [], externalAccountId: "a", externalTenantId: undefined, externalAccountLabel: undefined, encryptedAccessToken: "enc:x", encryptedRefreshToken: "enc:r", expiresAt: undefined, occurredAt: new Date() });
    connection.markReauthRequired({ reason: "refresh token revoked upstream", occurredAt: new Date() });
    expect(connection.status).toBe(ConnectionStatus.ReauthRequired);

    connection.activate({ connectedBy: "u", scopes: ["a"], externalAccountId: "a", externalTenantId: undefined, externalAccountLabel: undefined, encryptedAccessToken: "enc:new", encryptedRefreshToken: "enc:new-r", expiresAt: undefined, occurredAt: new Date() });
    expect(connection.status).toBe(ConnectionStatus.Active);
    expect(connection.lastError).toBeUndefined();
  });

  it("BLOQUANT — revoke() erases the encrypted credentials, never just flips a status flag (mission §12)", () => {
    const connection = initiate();
    connection.activate({ connectedBy: "u", scopes: [], externalAccountId: "a", externalTenantId: undefined, externalAccountLabel: undefined, encryptedAccessToken: "enc:access", encryptedRefreshToken: "enc:refresh", expiresAt: undefined, occurredAt: new Date() });

    connection.revoke({ revokedBy: "user-1", occurredAt: new Date() });

    expect(connection.status).toBe(ConnectionStatus.Revoked);
    expect(connection.encryptedAccessToken).toBeUndefined();
    expect(connection.encryptedRefreshToken).toBeUndefined();
  });

  it("BLOQUANT — a REVOKED connection can never be reactivated (a new connection is required instead)", () => {
    const connection = initiate();
    connection.revoke({ revokedBy: "user-1", occurredAt: new Date() });

    expect(() => connection.activate({ connectedBy: "u", scopes: [], externalAccountId: "a", externalTenantId: undefined, externalAccountLabel: undefined, encryptedAccessToken: "x", encryptedRefreshToken: undefined, expiresAt: undefined, occurredAt: new Date() })).toThrow(
      ExternalConnectionRevokedError,
    );
    expect(() => connection.markReauthRequired({ reason: "x", occurredAt: new Date() })).toThrow(ExternalConnectionRevokedError);
  });

  it("mission §49 — isClientAllowed: empty allow-list means no restriction, non-empty means STRICT narrowing", () => {
    const unrestricted = initiate();
    expect(unrestricted.isClientAllowed("client-a")).toBe(true);
    expect(unrestricted.isClientAllowed(undefined)).toBe(true);

    const restricted = initiate({ allowedClientAccountIds: ["client-a"] });
    expect(restricted.isClientAllowed("client-a")).toBe(true);
    expect(restricted.isClientAllowed("client-b")).toBe(false);
    expect(restricted.isClientAllowed(undefined)).toBe(false);
  });
});
