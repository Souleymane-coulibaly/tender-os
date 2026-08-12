import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ConnectorProvider } from "./enums";
import { OAuthStateInvalidError } from "./errors";
import { OAuthFlowState } from "./oauth-flow-state.entity";

function initiate(ttlMs = 600_000) {
  return OAuthFlowState.initiate({
    id: randomUUID(),
    state: randomUUID(),
    organizationId: randomUUID(),
    userId: randomUUID(),
    provider: ConnectorProvider.Microsoft365,
    codeVerifier: "verifier",
    occurredAt: new Date("2026-01-01T10:00:00Z"),
    ttlMs,
  });
}

describe("OAuthFlowState", () => {
  it("consume() succeeds once, within the TTL", () => {
    const flowState = initiate();
    expect(() => flowState.consume(new Date("2026-01-01T10:01:00Z"))).not.toThrow();
    expect(flowState.consumedAt).toBeDefined();
  });

  it("BLOQUANT — consume() throws on a second attempt (mission §55, single-use, never replayable)", () => {
    const flowState = initiate();
    flowState.consume(new Date("2026-01-01T10:01:00Z"));
    expect(() => flowState.consume(new Date("2026-01-01T10:02:00Z"))).toThrow(OAuthStateInvalidError);
  });

  it("BLOQUANT — consume() throws once expired (mission §7)", () => {
    const flowState = initiate(1000);
    expect(() => flowState.consume(new Date("2026-01-01T10:00:02Z"))).toThrow(OAuthStateInvalidError);
  });
});
