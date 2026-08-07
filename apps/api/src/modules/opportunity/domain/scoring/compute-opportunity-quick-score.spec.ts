import { describe, expect, it } from "vitest";
import { computeOpportunityQuickScore, type ComputeQuickScoreInput, type QuickScoreCompanyProfileInput } from "./compute-opportunity-quick-score";

const NOW = new Date("2026-03-01T00:00:00Z");

const COMPLETE_PROFILE: QuickScoreCompanyProfileInput = {
  hasLegalIdentity: true,
  validCertificationCount: 2,
  expiredCertificationCount: 0,
  validInsuranceCount: 1,
  expiredInsuranceCount: 0,
  matchingReferenceCount: 3,
  totalReferenceCount: 3,
  humanResourceCount: 2,
  materialResourceCount: 1,
  identityCompleteness: "COMPLETE",
};

function baseInput(overrides: Partial<ComputeQuickScoreInput> = {}): ComputeQuickScoreInput {
  return { now: NOW, ...overrides };
}

describe("computeOpportunityQuickScore", () => {
  it("is deterministic: same input always produces the same output", () => {
    const input = baseInput({ companyProfile: COMPLETE_PROFILE, submissionDeadline: new Date("2026-04-01T00:00:00Z") });

    const first = computeOpportunityQuickScore(input);
    const second = computeOpportunityQuickScore(input);

    expect(first).toEqual(second);
  });

  it("decomposes the global score into 8 weighted, justified categories summing their declared weights to 100", () => {
    const result = computeOpportunityQuickScore(baseInput({ companyProfile: COMPLETE_PROFILE }));

    const categories = Object.values(result.categoryScores);
    expect(categories).toHaveLength(8);
    for (const category of categories) {
      expect(category.justification).toBeTruthy();
      expect(category.score).toBeGreaterThanOrEqual(0);
      expect(category.score).toBeLessThanOrEqual(100);
    }
    const totalWeight = categories.reduce((sum, c) => sum + c.weight, 0);
    expect(totalWeight).toBe(100);
  });

  it("never invents a financial capacity signal: always flags it as missing data with a neutral score", () => {
    const result = computeOpportunityQuickScore(baseInput({ companyProfile: COMPLETE_PROFILE }));

    expect(result.categoryScores.financier.score).toBe(50);
    expect(result.missingData.some((m) => m.toLowerCase().includes("financière"))).toBe(true);
  });

  it("degrades gracefully with no company profile: lower scores, more missing data, lower confidence", () => {
    const withProfile = computeOpportunityQuickScore(baseInput({ companyProfile: COMPLETE_PROFILE }));
    const withoutProfile = computeOpportunityQuickScore(baseInput());

    expect(withoutProfile.globalScore).toBeLessThan(withProfile.globalScore);
    expect(withoutProfile.confidence).toBeLessThanOrEqual(withProfile.confidence);
    expect(withoutProfile.missingData.length).toBeGreaterThan(withProfile.missingData.length);
  });

  it("flags a blocker (not a mere weakness) when the submission deadline has already passed", () => {
    const result = computeOpportunityQuickScore(baseInput({ submissionDeadline: new Date("2026-02-01T00:00:00Z"), companyProfile: COMPLETE_PROFILE }));

    expect(result.blockers).toHaveLength(1);
    expect(result.categoryScores.planning.score).toBe(0);
  });

  it("never lets a blocker silently change the global score formula: score stays a plain weighted average of category scores", () => {
    const result = computeOpportunityQuickScore(baseInput({ submissionDeadline: new Date("2026-02-01T00:00:00Z"), companyProfile: COMPLETE_PROFILE }));

    const categories = Object.values(result.categoryScores);
    const expected = Math.round((categories.reduce((sum, c) => sum + c.score * c.weight, 0) / 100) * 100) / 100;
    expect(result.globalScore).toBeCloseTo(expected, 2);
  });

  it("computes confidence strictly as a function of the missingData count (auditable, never arbitrary)", () => {
    const result = computeOpportunityQuickScore(baseInput());
    const expectedPenalty = Math.min(0.7, result.missingData.length * 0.12);
    expect(result.confidence).toBeCloseTo(Math.round((1 - expectedPenalty) * 100) / 100, 2);
  });

  it("bumps indicative complexity when the deadline is under 15 days away or no references exist", () => {
    const soon = computeOpportunityQuickScore(baseInput({ submissionDeadline: new Date("2026-03-10T00:00:00Z"), companyProfile: COMPLETE_PROFILE }));
    const far = computeOpportunityQuickScore(baseInput({ submissionDeadline: new Date("2026-06-01T00:00:00Z"), companyProfile: COMPLETE_PROFILE }));

    expect(soon.complexity).toBeGreaterThan(far.complexity);
  });

  it("derives strengths (score >= 70) and weaknesses (score <= 30) directly from category scores", () => {
    const result = computeOpportunityQuickScore(baseInput({ companyProfile: COMPLETE_PROFILE, submissionDeadline: new Date("2026-04-01T00:00:00Z") }));

    for (const strength of result.strengths) {
      expect(result.categoryScores[strength.category as keyof typeof result.categoryScores].score).toBeGreaterThanOrEqual(70);
    }
    for (const weakness of result.weaknesses) {
      expect(result.categoryScores[weakness.category as keyof typeof result.categoryScores].score).toBeLessThanOrEqual(30);
    }
  });
});
