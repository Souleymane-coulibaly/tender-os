import { describe, expect, it } from "vitest";
import { PromptKey } from "../../analysis";
import { RoutingPolicy } from "./routing-policy.aggregate";
import { RoutingPolicyStatus } from "./routing-policy-status";
import { InvalidRoutingPolicyStatusTransitionError } from "./errors";

const NOW = new Date("2026-07-30T10:00:00Z");

function createPolicy() {
  return RoutingPolicy.create({
    id: "policy-1",
    organizationId: "org-1",
    promptKey: PromptKey.AnalyzeDocument,
    version: 1,
    primaryAiModelId: "model-1",
    timeoutMs: 30000,
    maxRetries: 2,
    escalationConditions: [],
    authorUserId: "user-1",
    occurredAt: NOW,
  });
}

describe("RoutingPolicy", () => {
  it("is created DRAFT, never active by default", () => {
    const policy = createPolicy();
    expect(policy.status).toBe(RoutingPolicyStatus.Draft);
    expect(policy.effectiveFrom).toBeUndefined();
  });

  it("activate() transitions DRAFT -> ACTIVE and records effectiveFrom", () => {
    const policy = createPolicy();
    policy.activate(NOW);
    expect(policy.status).toBe(RoutingPolicyStatus.Active);
    expect(policy.effectiveFrom).toEqual(NOW);
  });

  it("archive() transitions ACTIVE -> ARCHIVED", () => {
    const policy = createPolicy();
    policy.activate(NOW);
    policy.archive(NOW);
    expect(policy.status).toBe(RoutingPolicyStatus.Archived);
    expect(policy.archivedAt).toEqual(NOW);
  });

  it("archive() also allows discarding a DRAFT directly, without ever activating", () => {
    const policy = createPolicy();
    policy.archive(NOW);
    expect(policy.status).toBe(RoutingPolicyStatus.Archived);
  });

  it("refuses any transition once ARCHIVED", () => {
    const policy = createPolicy();
    policy.archive(NOW);
    expect(() => policy.activate(NOW)).toThrow(InvalidRoutingPolicyStatusTransitionError);
  });
});
