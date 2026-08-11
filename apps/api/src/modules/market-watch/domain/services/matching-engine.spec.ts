import { describe, expect, it } from "vitest";
import { evaluateMatch, type MatchableTender, type SavedSearchCriteria } from "./matching-engine";

const NOW = new Date("2026-06-15T00:00:00.000Z");

const EMPTY_CRITERIA: SavedSearchCriteria = {
  includeKeywords: [],
  excludeKeywords: [],
  cpvCodes: [],
  countries: [],
  regions: [],
  departments: [],
  cities: [],
  marketTypes: [],
  sources: [],
  includeUnknownAmount: true,
  procedureTypes: [],
};

function buildTender(overrides: Partial<MatchableTender> = {}): MatchableTender {
  return { title: "Marché de nettoyage industriel", marketType: "PUBLIC", source: "BOAMP", cpvCodes: ["90910000"], country: "FR", ...overrides };
}

describe("evaluateMatch — mission §26/§28/§121/§122/§123", () => {
  it("mission §121 keyword include: matches when the keyword is present", () => {
    const result = evaluateMatch({ ...EMPTY_CRITERIA, includeKeywords: ["nettoyage"] }, buildTender(), NOW);
    expect(result.matched).toBe(true);
  });

  it("mission §121 keyword include: excludes when no include keyword is present", () => {
    const result = evaluateMatch({ ...EMPTY_CRITERIA, includeKeywords: ["cybersécurité"] }, buildTender(), NOW);
    expect(result).toEqual({ matched: false, failedHardCriterion: "keywords" });
  });

  it("mission §121 keyword exclude: excludes when an exclude keyword is present, even if include matches", () => {
    const result = evaluateMatch({ ...EMPTY_CRITERIA, includeKeywords: ["nettoyage"], excludeKeywords: ["industriel"] }, buildTender(), NOW);
    expect(result).toEqual({ matched: false, failedHardCriterion: "keywords" });
  });

  it("mission §121 CPV: matches by hierarchy", () => {
    const result = evaluateMatch({ ...EMPTY_CRITERIA, cpvCodes: ["90000000"] }, buildTender({ cpvCodes: ["90910000"] }), NOW);
    expect(result.matched).toBe(true);
  });

  it("mission §121 CPV: excludes a different family", () => {
    const result = evaluateMatch({ ...EMPTY_CRITERIA, cpvCodes: ["45000000"] }, buildTender({ cpvCodes: ["90910000"] }), NOW);
    expect(result).toEqual({ matched: false, failedHardCriterion: "cpv" });
  });

  it("mission §122 BLOQUANT — country is a HARD filter: a semantically-perfect German tender is excluded when country=FR is required", () => {
    const tender = buildTender({ title: "Nettoyage industriel professionnel", country: "DE" });
    const result = evaluateMatch({ ...EMPTY_CRITERIA, countries: ["FR"], includeKeywords: ["nettoyage"] }, tender, NOW);
    expect(result).toEqual({ matched: false, failedHardCriterion: "country" });
  });

  it("mission §22 country hard filter: unknown tender country is excluded (never assume compliance)", () => {
    const result = evaluateMatch({ ...EMPTY_CRITERIA, countries: ["FR"] }, buildTender({ country: undefined }), NOW);
    expect(result).toEqual({ matched: false, failedHardCriterion: "country" });
  });

  it("mission §121 location: matches on department", () => {
    const result = evaluateMatch({ ...EMPTY_CRITERIA, departments: ["75"] }, buildTender({ department: "75" }), NOW);
    expect(result.matched).toBe(true);
  });

  it("mission §121 amount: within range matches", () => {
    const result = evaluateMatch({ ...EMPTY_CRITERIA, minAmount: 100_000, maxAmount: 500_000 }, buildTender({ estimatedAmount: 200_000 }), NOW);
    expect(result.matched).toBe(true);
  });

  it("mission §121 amount: outside range is excluded", () => {
    const result = evaluateMatch({ ...EMPTY_CRITERIA, minAmount: 100_000 }, buildTender({ estimatedAmount: 50_000 }), NOW);
    expect(result).toEqual({ matched: false, failedHardCriterion: "amount" });
  });

  it("mission §23/§121 unknown amount: included by default (includeUnknownAmount=true)", () => {
    const result = evaluateMatch({ ...EMPTY_CRITERIA, minAmount: 100_000, includeUnknownAmount: true }, buildTender({ estimatedAmount: undefined }), NOW);
    expect(result.matched).toBe(true);
  });

  it("mission §23/§121 unknown amount: excluded when includeUnknownAmount=false", () => {
    const result = evaluateMatch({ ...EMPTY_CRITERIA, minAmount: 100_000, includeUnknownAmount: false }, buildTender({ estimatedAmount: undefined }), NOW);
    expect(result).toEqual({ matched: false, failedHardCriterion: "amount" });
  });

  it("mission §24/§121 deadline: deadlineAfterDays excludes a too-soon deadline", () => {
    const tender = buildTender({ submissionDeadline: new Date("2026-06-18T00:00:00.000Z") }); // 3 days from NOW
    const result = evaluateMatch({ ...EMPTY_CRITERIA, deadlineAfterDays: 14 }, tender, NOW);
    expect(result).toEqual({ matched: false, failedHardCriterion: "deadlineAfterDays" });
  });

  it("mission §24/§121 deadline: deadlineAfterDays matches a sufficiently future deadline", () => {
    const tender = buildTender({ submissionDeadline: new Date("2026-07-15T00:00:00.000Z") }); // 30 days from NOW
    const result = evaluateMatch({ ...EMPTY_CRITERIA, deadlineAfterDays: 14 }, tender, NOW);
    expect(result.matched).toBe(true);
  });

  it("mission §121 source: excludes a non-listed source", () => {
    const result = evaluateMatch({ ...EMPTY_CRITERIA, sources: ["TED"] }, buildTender({ source: "BOAMP" }), NOW);
    expect(result).toEqual({ matched: false, failedHardCriterion: "source" });
  });

  it("mission §121 public/private: excludes a mismatched market type", () => {
    const result = evaluateMatch({ ...EMPTY_CRITERIA, marketTypes: ["PRIVATE"] }, buildTender({ marketType: "PUBLIC" }), NOW);
    expect(result).toEqual({ matched: false, failedHardCriterion: "marketType" });
  });

  it("mission §123 BLOQUANT — score is explicable: only criteria actually specified contribute reasons", () => {
    const result = evaluateMatch({ ...EMPTY_CRITERIA, includeKeywords: ["nettoyage"], cpvCodes: ["90000000"] }, buildTender(), NOW);
    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.score).toBeGreaterThan(0);
      expect(result.score).toBeLessThanOrEqual(100);
      const criteria = result.reasons.map((r) => r.criterion);
      expect(criteria).toContain("keywords");
      expect(criteria).toContain("cpv");
      // Aucun critère géographie/montant : rien de spécifié pour ces dimensions.
      expect(criteria).not.toContain("geography");
      expect(criteria).not.toContain("amount");
    }
  });

  it("an empty criteria set matches everything (no restriction specified)", () => {
    const result = evaluateMatch(EMPTY_CRITERIA, buildTender(), NOW);
    expect(result.matched).toBe(true);
  });
});
