import { describe, expect, it } from "vitest";
import { runValidationRules } from "./validation-rules.engine";

describe("runValidationRules", () => {
  it("flags a missing mandatory section as BLOCKING", () => {
    const issues = runValidationRules({
      exportJobId: "job-1",
      sections: [{ sectionId: "SUMMARY", label: "Résumé", mandatory: true, selected: false }],
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]!.ruleCode).toBe("MANDATORY_SECTION_MISSING");
    expect(issues[0]!.severity).toBe("BLOCKING");
  });

  it("never flags a missing optional section", () => {
    const issues = runValidationRules({
      exportJobId: "job-1",
      sections: [{ sectionId: "ANNEX", label: "Annexe", mandatory: false, selected: false }],
    });
    expect(issues).toHaveLength(0);
  });

  it("flags an unvalidated generation as BLOCKING", () => {
    const issues = runValidationRules({
      exportJobId: "job-1",
      sections: [{ sectionId: "SUMMARY", label: "Résumé", mandatory: true, selected: true, sourceType: "GENERATION", validationStatus: "NOT_VALIDATED" }],
    });
    expect(issues.some((i) => i.ruleCode === "UNVALIDATED_CONTENT" && i.severity === "BLOCKING")).toBe(true);
  });

  it("never flags a validated generation", () => {
    const issues = runValidationRules({
      exportJobId: "job-1",
      sections: [{ sectionId: "SUMMARY", label: "Résumé", mandatory: true, selected: true, sourceType: "GENERATION", validationStatus: "VALIDATED", textLength: 500 }],
    });
    expect(issues).toHaveLength(0);
  });

  it("flags very short content as a non-blocking WARNING", () => {
    const issues = runValidationRules({
      exportJobId: "job-1",
      sections: [{ sectionId: "SUMMARY", label: "Résumé", mandatory: true, selected: true, sourceType: "MANUAL", textLength: 5 }],
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe("WARNING");
  });

  it("returns no issues for a fully valid, complete selection", () => {
    const issues = runValidationRules({
      exportJobId: "job-1",
      sections: [{ sectionId: "SUMMARY", label: "Résumé", mandatory: true, selected: true, sourceType: "MANUAL", textLength: 500 }],
    });
    expect(issues).toHaveLength(0);
  });
});
