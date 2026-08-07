import { describe, expect, it } from "vitest";
import { GoNoGoDecisionConditionsRequiredError, GoNoGoDecisionJustificationRequiredError, InvalidGoNoGoDecisionError } from "./errors";
import { assertValidGoNoGoDecisionInput, GoNoGoDecisionValue, opportunityStatusForDecision, parseGoNoGoDecisionValue } from "./go-no-go-decision";
import { OpportunityStatus } from "./opportunity-status";

describe("parseGoNoGoDecisionValue", () => {
  it("accepts GO/GO_CONDITIONAL/NO_GO", () => {
    expect(parseGoNoGoDecisionValue("GO")).toBe(GoNoGoDecisionValue.Go);
    expect(parseGoNoGoDecisionValue("GO_CONDITIONAL")).toBe(GoNoGoDecisionValue.GoConditional);
    expect(parseGoNoGoDecisionValue("NO_GO")).toBe(GoNoGoDecisionValue.NoGo);
  });

  it("rejects anything else, including the Sprint 4 vocabulary GO_WITH_RESERVATIONS", () => {
    expect(() => parseGoNoGoDecisionValue("GO_WITH_RESERVATIONS")).toThrow(InvalidGoNoGoDecisionError);
  });
});

describe("assertValidGoNoGoDecisionInput", () => {
  it("requires a non-blank justification for NO_GO", () => {
    expect(() => assertValidGoNoGoDecisionInput({ decision: GoNoGoDecisionValue.NoGo })).toThrow(GoNoGoDecisionJustificationRequiredError);
    expect(() => assertValidGoNoGoDecisionInput({ decision: GoNoGoDecisionValue.NoGo, justification: "   " })).toThrow(GoNoGoDecisionJustificationRequiredError);
    expect(() => assertValidGoNoGoDecisionInput({ decision: GoNoGoDecisionValue.NoGo, justification: "Capacité technique insuffisante." })).not.toThrow();
  });

  it("requires non-blank conditions for GO_CONDITIONAL", () => {
    expect(() => assertValidGoNoGoDecisionInput({ decision: GoNoGoDecisionValue.GoConditional })).toThrow(GoNoGoDecisionConditionsRequiredError);
    expect(() => assertValidGoNoGoDecisionInput({ decision: GoNoGoDecisionValue.GoConditional, conditions: "" })).toThrow(GoNoGoDecisionConditionsRequiredError);
    expect(() => assertValidGoNoGoDecisionInput({ decision: GoNoGoDecisionValue.GoConditional, conditions: "Sous réserve d'un renfort RH." })).not.toThrow();
  });

  it("never requires justification/conditions for a plain GO", () => {
    expect(() => assertValidGoNoGoDecisionInput({ decision: GoNoGoDecisionValue.Go })).not.toThrow();
  });
});

describe("opportunityStatusForDecision", () => {
  it("maps each decision value to its exact matching Opportunity status", () => {
    expect(opportunityStatusForDecision(GoNoGoDecisionValue.Go)).toBe(OpportunityStatus.Go);
    expect(opportunityStatusForDecision(GoNoGoDecisionValue.GoConditional)).toBe(OpportunityStatus.GoConditional);
    expect(opportunityStatusForDecision(GoNoGoDecisionValue.NoGo)).toBe(OpportunityStatus.NoGo);
  });
});
