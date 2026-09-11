import { describe, expect, it } from "vitest";
import { AI_ROUTING_MODEL_CATALOG } from "../../ai-routing/domain/ai-routing-model";
import { isModelKeyAllowed, listAllowedModelKeys } from "./allowed-model-catalog";

describe("allowed-model-catalog", () => {
  it("lets an administrator register — and price — every model the router can really call", () => {
    for (const { provider, modelKey } of Object.values(AI_ROUTING_MODEL_CATALOG)) {
      expect(isModelKeyAllowed(provider, modelKey), `${provider}/${modelKey} doit être enregistrable`).toBe(true);
    }
  });

  it("accepts a modelKey present in the OpenAI catalog", () => {
    expect(isModelKeyAllowed("OPENAI", "gpt-4o-mini")).toBe(true);
  });

  it("rejects a modelKey absent from the catalog, even for a known provider", () => {
    expect(isModelKeyAllowed("OPENAI", "not-a-real-model")).toBe(false);
  });

  it("rejects every modelKey for a provider with no real adapter (Sprint 5.2 correction — no fake multi-provider support)", () => {
    expect(isModelKeyAllowed("ANTHROPIC", "claude-3-opus")).toBe(false);
    expect(listAllowedModelKeys("ANTHROPIC")).toEqual([]);
  });

  it("rejects an entirely unknown provider", () => {
    expect(isModelKeyAllowed("UNKNOWN_PROVIDER", "gpt-4o-mini")).toBe(false);
  });
});
