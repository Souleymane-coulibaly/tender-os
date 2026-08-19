import { describe, expect, it } from "vitest";
import { evaluateFileReadinessReasons, type FileReadinessInput } from "./evaluate-file-readiness";

const READY_INPUT: FileReadinessInput = {
  candidateCompanyId: "candidate-alpha",
  analysis: { exists: true, freshness: "CURRENT" },
  checklist: { freshness: "CURRENT" },
  goNoGo: { exists: true, freshness: "CURRENT", recommendation: "GO" },
  technicalMemo: { exists: true, freshness: "CURRENT" },
  validation: { hasActiveApproval: true, freshness: "CURRENT" },
  responsePackage: { exists: true, freshness: "CURRENT", isCurrentVersionValidated: true },
};

function withOverrides(overrides: Partial<FileReadinessInput>): FileReadinessInput {
  return { ...READY_INPUT, ...overrides };
}

describe("evaluateFileReadinessReasons (Checkpoint 2.1-P2.1-FIX-F)", () => {
  // TEST 1 — happy path complet.
  it("BLOQUANT — TEST 1: happy path complet produit zéro raison", () => {
    expect(evaluateFileReadinessReasons(READY_INPUT)).toEqual([]);
  });

  // TEST 2 — Candidate missing.
  it("TEST 2 — candidate missing → CANDIDATE_MISSING blocking", () => {
    const reasons = evaluateFileReadinessReasons(withOverrides({ candidateCompanyId: undefined }));
    expect(reasons).toContainEqual(expect.objectContaining({ code: "CANDIDATE_MISSING", severity: "BLOCKING" }));
  });

  // TEST 3/4 — Analysis.
  it("TEST 3 — analysis STALE → ANALYSIS_STALE blocking", () => {
    const reasons = evaluateFileReadinessReasons(withOverrides({ analysis: { exists: true, freshness: "STALE" } }));
    expect(reasons).toContainEqual(expect.objectContaining({ code: "ANALYSIS_STALE", severity: "BLOCKING" }));
  });

  it("TEST 4 — analysis UNKNOWN/missing → ANALYSIS_UNKNOWN or ANALYSIS_MISSING blocking", () => {
    const unknown = evaluateFileReadinessReasons(withOverrides({ analysis: { exists: true, freshness: "UNKNOWN" } }));
    expect(unknown).toContainEqual(expect.objectContaining({ code: "ANALYSIS_UNKNOWN", severity: "BLOCKING" }));

    const missing = evaluateFileReadinessReasons(withOverrides({ analysis: { exists: false, freshness: undefined } }));
    expect(missing).toContainEqual(expect.objectContaining({ code: "ANALYSIS_MISSING", severity: "BLOCKING" }));
  });

  // TEST 5/6/7 — Checklist.
  it("TEST 5 — checklist RECONCILIATION_REQUIRED → CHECKLIST_STALE blocking", () => {
    const reasons = evaluateFileReadinessReasons(withOverrides({ checklist: { freshness: "RECONCILIATION_REQUIRED" } }));
    expect(reasons).toContainEqual(expect.objectContaining({ code: "CHECKLIST_STALE", severity: "BLOCKING" }));
  });

  // TEST 8/9 — GO/NO-GO.
  it("TEST 8 — go-no-go STALE → GONOGO_STALE blocking (only if a report exists)", () => {
    const reasons = evaluateFileReadinessReasons(withOverrides({ goNoGo: { exists: true, freshness: "STALE", recommendation: "GO" } }));
    expect(reasons).toContainEqual(expect.objectContaining({ code: "GONOGO_STALE", severity: "BLOCKING" }));
  });

  it("go-no-go missing entirely → never blocking (never a fabricated dependency)", () => {
    const reasons = evaluateFileReadinessReasons(withOverrides({ goNoGo: { exists: false, freshness: undefined, recommendation: undefined } }));
    expect(reasons.some((r) => r.source === "GO_NO_GO")).toBe(false);
  });

  // TEST 9 — NO-GO recommendation is WARNING only, never blocking (audit found no existing hard rule).
  it("TEST 9 — NO-GO recommendation is a WARNING, never blocking", () => {
    const reasons = evaluateFileReadinessReasons(withOverrides({ goNoGo: { exists: true, freshness: "CURRENT", recommendation: "NO_GO" } }));
    expect(reasons).toContainEqual(expect.objectContaining({ code: "GONOGO_NO_GO", severity: "WARNING" }));
    expect(reasons.some((r) => r.code === "GONOGO_NO_GO" && r.severity === "BLOCKING")).toBe(false);
  });

  // TEST 10/11/12/13 — Technical Memo.
  it("TEST 10 — technical memo missing entirely → never blocking (not required for a tender without one)", () => {
    const reasons = evaluateFileReadinessReasons(withOverrides({ technicalMemo: { exists: false, freshness: undefined } }));
    expect(reasons.some((r) => r.source === "TECHNICAL_MEMO")).toBe(false);
  });

  it("TEST 12 — technical memo STALE (when it exists) → TECHNICAL_MEMO_STALE blocking", () => {
    const reasons = evaluateFileReadinessReasons(withOverrides({ technicalMemo: { exists: true, freshness: "STALE" } }));
    expect(reasons).toContainEqual(expect.objectContaining({ code: "TECHNICAL_MEMO_STALE", severity: "BLOCKING" }));
  });

  // TEST 19-22 — Validation. Mission §61 "no god validation" — proven by the fact these tests use
  // the READY_INPUT baseline (all other dimensions CURRENT) and STILL block purely on Validation.
  it("TEST 19 — FinalApproval missing → VALIDATION_MISSING blocking", () => {
    const reasons = evaluateFileReadinessReasons(withOverrides({ validation: { hasActiveApproval: false, freshness: "UNKNOWN" } }));
    expect(reasons).toContainEqual(expect.objectContaining({ code: "VALIDATION_MISSING", severity: "BLOCKING" }));
  });

  it("TEST 20 — FinalApproval APPROVED + STALE → VALIDATION_STALE blocking (never a god validation)", () => {
    const reasons = evaluateFileReadinessReasons(withOverrides({ validation: { hasActiveApproval: true, freshness: "STALE" } }));
    expect(reasons).toContainEqual(expect.objectContaining({ code: "VALIDATION_STALE", severity: "BLOCKING" }));
  });

  it("TEST 21 — FinalApproval APPROVED + UNKNOWN → VALIDATION_UNKNOWN blocking", () => {
    const reasons = evaluateFileReadinessReasons(withOverrides({ validation: { hasActiveApproval: true, freshness: "UNKNOWN" } }));
    expect(reasons).toContainEqual(expect.objectContaining({ code: "VALIDATION_UNKNOWN", severity: "BLOCKING" }));
  });

  it("TEST 22 — FinalApproval APPROVED + CURRENT → validation condition satisfied", () => {
    const reasons = evaluateFileReadinessReasons(withOverrides({ validation: { hasActiveApproval: true, freshness: "CURRENT" } }));
    expect(reasons.some((r) => r.source === "VALIDATION")).toBe(false);
  });

  // TEST 23-28 — Response Package.
  it("TEST 23 — response package missing → RESPONSE_PACKAGE_MISSING blocking", () => {
    const reasons = evaluateFileReadinessReasons(withOverrides({ responsePackage: { exists: false, freshness: undefined, isCurrentVersionValidated: undefined } }));
    expect(reasons).toContainEqual(expect.objectContaining({ code: "RESPONSE_PACKAGE_MISSING", severity: "BLOCKING" }));
  });

  it("TEST 24 — response package STALE → RESPONSE_PACKAGE_STALE blocking", () => {
    const reasons = evaluateFileReadinessReasons(withOverrides({ responsePackage: { exists: true, freshness: "STALE", isCurrentVersionValidated: true } }));
    expect(reasons).toContainEqual(expect.objectContaining({ code: "RESPONSE_PACKAGE_STALE", severity: "BLOCKING" }));
  });

  it("TEST 25 — response package UNKNOWN → RESPONSE_PACKAGE_UNKNOWN blocking", () => {
    const reasons = evaluateFileReadinessReasons(withOverrides({ responsePackage: { exists: true, freshness: "UNKNOWN", isCurrentVersionValidated: true } }));
    expect(reasons).toContainEqual(expect.objectContaining({ code: "RESPONSE_PACKAGE_UNKNOWN", severity: "BLOCKING" }));
  });

  it("TEST 27 — response package CURRENT but not validated → RESPONSE_PACKAGE_INCOMPLETE blocking", () => {
    const reasons = evaluateFileReadinessReasons(withOverrides({ responsePackage: { exists: true, freshness: "CURRENT", isCurrentVersionValidated: false } }));
    expect(reasons).toContainEqual(expect.objectContaining({ code: "RESPONSE_PACKAGE_INCOMPLETE", severity: "BLOCKING" }));
  });

  it("TEST 28 — response package CURRENT + validated → package condition satisfied", () => {
    const reasons = evaluateFileReadinessReasons(withOverrides({ responsePackage: { exists: true, freshness: "CURRENT", isCurrentVersionValidated: true } }));
    expect(reasons.some((r) => r.source === "RESPONSE_PACKAGE")).toBe(false);
  });

  it("§131-133 — deterministic ordering, independent of insertion order", () => {
    const scrambled = evaluateFileReadinessReasons(
      withOverrides({
        responsePackage: { exists: false, freshness: undefined, isCurrentVersionValidated: undefined },
        candidateCompanyId: undefined,
        validation: { hasActiveApproval: false, freshness: "UNKNOWN" },
      }),
    );
    const codes = scrambled.map((r) => r.code);
    expect(codes).toEqual(["CANDIDATE_MISSING", "VALIDATION_MISSING", "RESPONSE_PACKAGE_MISSING"]);
  });
});
