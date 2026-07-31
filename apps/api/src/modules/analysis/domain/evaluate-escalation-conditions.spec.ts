import { describe, expect, it } from "vitest";
import { EscalationCondition } from "./escalation-condition";
import { evaluateEscalationConditions, type EscalationSignals } from "./evaluate-escalation-conditions";

const HEALTHY: EscalationSignals = {
  jsonValid: true,
  provenanceStatus: "VALID",
  confidence: 0.9,
  complete: true,
  providerErrorOccurred: false,
  timedOut: false,
};

describe("evaluateEscalationConditions", () => {
  it("returns null when every signal is healthy", () => {
    expect(evaluateEscalationConditions(HEALTHY, Object.values(EscalationCondition))).toBeNull();
  });

  it("never escalates on a condition the policy did not configure, even if the signal is bad", () => {
    const badJson: EscalationSignals = { ...HEALTHY, jsonValid: false };
    expect(evaluateEscalationConditions(badJson, [])).toBeNull();
    expect(evaluateEscalationConditions(badJson, [EscalationCondition.InvalidJson])).toBe(EscalationCondition.InvalidJson);
  });

  it("detects invalid JSON", () => {
    expect(
      evaluateEscalationConditions({ ...HEALTHY, jsonValid: false }, [EscalationCondition.InvalidJson]),
    ).toBe(EscalationCondition.InvalidJson);
  });

  it("detects unknown source vs citation not found as distinct conditions", () => {
    expect(
      evaluateEscalationConditions(
        { ...HEALTHY, provenanceStatus: "UNKNOWN_SOURCE" },
        [EscalationCondition.UnknownSource, EscalationCondition.CitationNotFound],
      ),
    ).toBe(EscalationCondition.UnknownSource);

    expect(
      evaluateEscalationConditions(
        { ...HEALTHY, provenanceStatus: "CITATION_NOT_FOUND" },
        [EscalationCondition.UnknownSource, EscalationCondition.CitationNotFound],
      ),
    ).toBe(EscalationCondition.CitationNotFound);
  });

  it("low confidence requires BOTH a configured threshold and a reported confidence value — never the model's self-reported score alone without a policy threshold", () => {
    const lowConfidence: EscalationSignals = { ...HEALTHY, confidence: 0.2 };
    expect(evaluateEscalationConditions(lowConfidence, [EscalationCondition.LowConfidence])).toBeNull(); // pas de seuil configuré
    expect(evaluateEscalationConditions(lowConfidence, [EscalationCondition.LowConfidence], 0.5)).toBe(EscalationCondition.LowConfidence);
    expect(evaluateEscalationConditions({ ...HEALTHY, confidence: 0.9 }, [EscalationCondition.LowConfidence], 0.5)).toBeNull();
  });

  it("detects an incomplete result", () => {
    expect(evaluateEscalationConditions({ ...HEALTHY, complete: false }, [EscalationCondition.IncompleteResult])).toBe(
      EscalationCondition.IncompleteResult,
    );
  });

  it("provider errors and timeouts take priority over other conditions", () => {
    const allBad: EscalationSignals = {
      jsonValid: false,
      provenanceStatus: "UNKNOWN_SOURCE",
      confidence: 0,
      complete: false,
      providerErrorOccurred: true,
      timedOut: true,
    };
    expect(evaluateEscalationConditions(allBad, Object.values(EscalationCondition), 0.5)).toBe(EscalationCondition.ProviderError);
  });
});
