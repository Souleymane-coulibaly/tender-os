import { describe, expect, it } from "vitest";
import { CreateRoutingPolicyBodySchema } from "./schemas";

const BASE_BODY = {
  primaryAiModelId: "11111111-1111-1111-1111-111111111111",
  timeoutMs: 30000,
  maxRetries: 2,
};

describe("CreateRoutingPolicyBodySchema — Consolidation IA Checkpoint A (Foundation §3)", () => {
  it("still accepts the 2 Analyse + 17 Génération task types (non-régression)", () => {
    for (const promptKey of ["ANALYZE_DOCUMENT", "CONSOLIDATE_TENDER_ANALYSIS", "EXECUTIVE_SUMMARY", "CRITERION_RESPONSE"]) {
      expect(CreateRoutingPolicyBodySchema.safeParse({ ...BASE_BODY, promptKey }).success).toBe(true);
    }
  });

  it("BLOQUANT — now accepts CHAT and TECHNICAL_MEMO_SECTION (nouveaux task types Checkpoint A §3)", () => {
    expect(CreateRoutingPolicyBodySchema.safeParse({ ...BASE_BODY, promptKey: "CHAT" }).success).toBe(true);
    expect(CreateRoutingPolicyBodySchema.safeParse({ ...BASE_BODY, promptKey: "TECHNICAL_MEMO_SECTION" }).success).toBe(true);
  });

  it("still rejects an arbitrary/unknown promptKey", () => {
    expect(CreateRoutingPolicyBodySchema.safeParse({ ...BASE_BODY, promptKey: "SOMETHING_UNKNOWN" }).success).toBe(false);
  });
});
