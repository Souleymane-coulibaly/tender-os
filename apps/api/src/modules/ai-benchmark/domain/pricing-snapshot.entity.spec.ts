import { describe, expect, it } from "vitest";
import { AiModelPricingSnapshot } from "./pricing-snapshot.entity";

const NOW = new Date("2026-07-30T10:00:00Z");

describe("AiModelPricingSnapshot", () => {
  it("is current when created, and stops being current once closed", () => {
    const snapshot = AiModelPricingSnapshot.create({
      id: "snap-1",
      aiModelId: "model-1",
      inputPricePerMillionTokens: "5",
      outputPricePerMillionTokens: "15",
      currency: "USD",
      occurredAt: NOW,
    });

    expect(snapshot.isCurrent).toBe(true);

    snapshot.close(new Date(NOW.getTime() + 1000));
    expect(snapshot.isCurrent).toBe(false);
  });

  it("estimates cost from token counts under this exact snapshot's pricing", () => {
    const snapshot = AiModelPricingSnapshot.create({
      id: "snap-1",
      aiModelId: "model-1",
      inputPricePerMillionTokens: "5",
      outputPricePerMillionTokens: "15",
      currency: "USD",
      occurredAt: NOW,
    });

    // 1,000,000 input tokens @ $5/M = $5 ; 500,000 output tokens @ $15/M = $7.5
    const cost = snapshot.estimateCost({ inputTokens: 1_000_000, outputTokens: 500_000 });
    expect(Number(cost)).toBeCloseTo(12.5, 6);
  });

  it("closing a snapshot never rewrites its historical price fields", () => {
    const snapshot = AiModelPricingSnapshot.create({
      id: "snap-1",
      aiModelId: "model-1",
      inputPricePerMillionTokens: "5",
      outputPricePerMillionTokens: "15",
      currency: "USD",
      occurredAt: NOW,
    });

    snapshot.close(new Date(NOW.getTime() + 1000));

    expect(snapshot.inputPricePerMillionTokens).toBe("5");
    expect(snapshot.outputPricePerMillionTokens).toBe("15");
  });
});
