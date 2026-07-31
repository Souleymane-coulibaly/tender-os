import { describe, expect, it } from "vitest";
import { AiModel } from "./ai-model.aggregate";
import { AiModelStatus } from "./ai-model-status";
import { AiModelDisabledError, ModelKeyNotAllowedError } from "./errors";

const NOW = new Date("2026-07-30T10:00:00Z");

describe("AiModel", () => {
  it("creates an ENABLED model for an allowed (provider, modelKey) pair", () => {
    const model = AiModel.create({ id: "model-1", provider: "OPENAI", modelKey: "gpt-4o-mini", displayName: "GPT-4o mini", occurredAt: NOW });

    expect(model.status).toBe(AiModelStatus.Enabled);
    expect(model.enabledForBenchmark).toBe(false);
    expect(model.enabledForProduction).toBe(false);
  });

  it("refuses a modelKey outside the allowed catalog (correction P0 — no arbitrary model string)", () => {
    expect(() =>
      AiModel.create({ id: "model-1", provider: "OPENAI", modelKey: "totally-made-up", displayName: "x", occurredAt: NOW }),
    ).toThrow(ModelKeyNotAllowedError);
  });

  it("refuses any modelKey for a provider with no real adapter", () => {
    expect(() =>
      AiModel.create({ id: "model-1", provider: "ANTHROPIC", modelKey: "claude-3-opus", displayName: "x", occurredAt: NOW }),
    ).toThrow(ModelKeyNotAllowedError);
  });

  it("enable()/disable() toggle status and bump updatedAt", () => {
    const model = AiModel.create({ id: "model-1", provider: "OPENAI", modelKey: "gpt-4o-mini", displayName: "x", occurredAt: NOW });
    const later = new Date(NOW.getTime() + 1000);

    model.disable(later);
    expect(model.status).toBe(AiModelStatus.Disabled);
    expect(model.updatedAt).toEqual(later);

    model.enable(later);
    expect(model.status).toBe(AiModelStatus.Enabled);
  });

  it("assertUsable() throws once disabled", () => {
    const model = AiModel.create({ id: "model-1", provider: "OPENAI", modelKey: "gpt-4o-mini", displayName: "x", occurredAt: NOW });
    model.disable(NOW);
    expect(() => model.assertUsable()).toThrow(AiModelDisabledError);
  });

  it("update() only mutates provided fields", () => {
    const model = AiModel.create({
      id: "model-1",
      provider: "OPENAI",
      modelKey: "gpt-4o-mini",
      displayName: "Original",
      enabledForBenchmark: true,
      occurredAt: NOW,
    });

    model.update({ displayName: "Renamed" }, NOW);

    expect(model.displayName).toBe("Renamed");
    expect(model.enabledForBenchmark).toBe(true);
  });
});
