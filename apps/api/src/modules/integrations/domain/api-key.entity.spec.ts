import { describe, expect, it } from "vitest";
import { ApiKey } from "./api-key.entity";
import { ApiKeyScope } from "./enums";

const NOW = new Date("2026-06-01T00:00:00.000Z");

function buildKey(overrides: Partial<Parameters<typeof ApiKey.create>[0]> = {}) {
  return ApiKey.create({
    id: "key-1",
    organizationId: "org-1",
    name: "n8n prod",
    keyPrefix: "tos_live_abcd1234",
    keyHash: "hash",
    scopes: [ApiKeyScope.TendersRead],
    allowedClientAccountIds: [],
    createdBy: "user-1",
    occurredAt: NOW,
    ...overrides,
  });
}

describe("ApiKey.isUsable", () => {
  it("is usable when neither revoked nor expired", () => {
    expect(buildKey().isUsable(NOW)).toBe(true);
  });

  it("BLOQUANT — is not usable once revoked", () => {
    const key = buildKey();
    key.revoke({ revokedBy: "user-1", occurredAt: NOW });
    expect(key.isUsable(NOW)).toBe(false);
  });

  it("BLOQUANT — is not usable once past expiresAt", () => {
    const key = buildKey({ expiresAt: new Date("2026-01-01T00:00:00.000Z") });
    expect(key.isUsable(NOW)).toBe(false);
  });

  it("is usable before expiresAt", () => {
    const key = buildKey({ expiresAt: new Date("2027-01-01T00:00:00.000Z") });
    expect(key.isUsable(NOW)).toBe(true);
  });
});

describe("ApiKey.hasScope", () => {
  it("returns true only for granted scopes (mission §14/§15 least privilege)", () => {
    const key = buildKey({ scopes: [ApiKeyScope.TendersRead] });
    expect(key.hasScope(ApiKeyScope.TendersRead)).toBe(true);
    expect(key.hasScope(ApiKeyScope.TasksWrite)).toBe(false);
  });
});

describe("ApiKey.isClientAllowed", () => {
  it("empty list = no additional restriction (organization-wide within scopes)", () => {
    const key = buildKey({ allowedClientAccountIds: [] });
    expect(key.isClientAllowed("client-a")).toBe(true);
    expect(key.isClientAllowed("client-b")).toBe(true);
  });

  it("BLOQUANT — non-empty list is a strict narrowing, never a widening (mission §18/§100)", () => {
    const key = buildKey({ allowedClientAccountIds: ["client-a"] });
    expect(key.isClientAllowed("client-a")).toBe(true);
    expect(key.isClientAllowed("client-b")).toBe(false);
  });

  it("BLOQUANT — [A,B] never allows C", () => {
    const key = buildKey({ allowedClientAccountIds: ["client-a", "client-b"] });
    expect(key.isClientAllowed("client-c")).toBe(false);
  });
});
