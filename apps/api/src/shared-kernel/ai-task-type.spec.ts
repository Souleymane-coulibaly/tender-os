import { describe, expect, it } from "vitest";
import { AI_TASK_TYPES } from "./ai-task-type";

describe("AI_TASK_TYPES — Consolidation IA Checkpoint A (Foundation)", () => {
  it("contains the 19 task types already routable before Checkpoint A (2 Analyse + 17 Génération)", () => {
    const preExisting = [
      "ANALYZE_DOCUMENT",
      "CONSOLIDATE_TENDER_ANALYSIS",
      "EXECUTIVE_SUMMARY",
      "NEED_UNDERSTANDING",
      "CRITERION_RESPONSE",
      "METHODOLOGY",
      "ORGANIZATION",
      "GOVERNANCE",
      "HUMAN_RESOURCES",
      "TECHNICAL_RESOURCES",
      "PLANNING",
      "RISK_MANAGEMENT",
      "QUALITY",
      "SECURITY",
      "CSR",
      "REFERENCES",
      "SECTION_SUMMARY",
      "REPHRASING",
      "CONTENT_IMPROVEMENT",
    ];
    for (const taskType of preExisting) {
      expect(AI_TASK_TYPES).toContain(taskType);
    }
  });

  it("BLOQUANT — includes the 2 new task types introduced for Chat and Mémoire technique (Checkpoint A §3)", () => {
    expect(AI_TASK_TYPES).toContain("CHAT");
    expect(AI_TASK_TYPES).toContain("TECHNICAL_MEMO_SECTION");
  });

  it("never includes the dead placeholder task type (jamais rendu, aucun use case réel)", () => {
    expect(AI_TASK_TYPES).not.toContain("TECHNICAL_VALIDATION_PLACEHOLDER");
  });

  it("has exactly 21 values, no duplicate", () => {
    expect(AI_TASK_TYPES).toHaveLength(21);
    expect(new Set(AI_TASK_TYPES).size).toBe(21);
  });
});
