import { describe, expect, it } from "vitest";
import { PromptKey } from "../../analysis";
import { ModelRecommendation } from "./model-recommendation.aggregate";
import { ModelRecommendationStatus } from "./model-recommendation-status";
import { ModelRecommendationNotDraftError } from "./errors";

const NOW = new Date("2026-07-30T10:00:00Z");

function createRecommendation() {
  return ModelRecommendation.create({
    id: "rec-1",
    organizationId: "org-1",
    promptKey: PromptKey.AnalyzeDocument,
    runId: "run-1",
    primaryAiModelId: "model-1",
    score: 0.9,
    avgCostAmount: "0.05",
    avgCostCurrency: "USD",
    avgLatencyMs: 500,
    confidence: 0.9,
    reasons: ["best score"],
    limitations: ["synthetic corpus"],
    occurredAt: NOW,
  });
}

describe("ModelRecommendation", () => {
  it("is created DRAFT, never auto-activated", () => {
    const recommendation = createRecommendation();
    expect(recommendation.status).toBe(ModelRecommendationStatus.Draft);
  });

  it("approve() requires an explicit decidedByUserId and moves to APPROVED", () => {
    const recommendation = createRecommendation();
    recommendation.approve("user-2", NOW);
    expect(recommendation.status).toBe(ModelRecommendationStatus.Approved);
    expect(recommendation.decidedByUserId).toBe("user-2");
  });

  it("reject() moves to REJECTED", () => {
    const recommendation = createRecommendation();
    recommendation.reject("user-2", NOW);
    expect(recommendation.status).toBe(ModelRecommendationStatus.Rejected);
  });

  it("refuses to approve/reject a recommendation that is no longer DRAFT", () => {
    const recommendation = createRecommendation();
    recommendation.approve("user-2", NOW);
    expect(() => recommendation.approve("user-3", NOW)).toThrow(ModelRecommendationNotDraftError);
    expect(() => recommendation.reject("user-3", NOW)).toThrow(ModelRecommendationNotDraftError);
  });
});
