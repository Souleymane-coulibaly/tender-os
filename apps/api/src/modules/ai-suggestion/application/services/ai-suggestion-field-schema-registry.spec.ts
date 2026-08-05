import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AiSuggestionFieldSchemaRegistry } from "./ai-suggestion-field-schema-registry";

describe("AiSuggestionFieldSchemaRegistry", () => {
  it("resolves the schema registered for a given (entityType, fieldName) pair", () => {
    const registry = new AiSuggestionFieldSchemaRegistry();
    const schema = z.string();
    registry.register("TENDER_LOT", "title", schema);

    expect(registry.resolve("TENDER_LOT", "title")).toBe(schema);
  });

  it("returns undefined for an unregistered pair", () => {
    const registry = new AiSuggestionFieldSchemaRegistry();

    expect(registry.resolve("TENDER_LOT", "unknown")).toBeUndefined();
  });

  it("keeps entityType and fieldName independent (no cross-contamination)", () => {
    const registry = new AiSuggestionFieldSchemaRegistry();
    const titleSchema = z.string();
    const amountSchema = z.number();
    registry.register("TENDER_LOT", "title", titleSchema);
    registry.register("PRICING_LINE", "amount", amountSchema);

    expect(registry.resolve("TENDER_LOT", "title")).toBe(titleSchema);
    expect(registry.resolve("PRICING_LINE", "amount")).toBe(amountSchema);
    expect(registry.resolve("TENDER_LOT", "amount")).toBeUndefined();
  });

  it("mission Sprint 1 correctif audit Codex P1-003 — refuses a second registration for the same pair (single governed source of truth)", () => {
    const registry = new AiSuggestionFieldSchemaRegistry();
    registry.register("TENDER_LOT", "title", z.string());

    expect(() => registry.register("TENDER_LOT", "title", z.string().max(10))).toThrow();
  });
});
