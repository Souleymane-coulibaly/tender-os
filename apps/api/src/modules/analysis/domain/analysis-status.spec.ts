import { describe, expect, it } from "vitest";
import {
  ALLOWED_ANALYSIS_TRANSITIONS,
  AnalysisStatus,
  isTerminalAnalysisStatus,
  parseAnalysisStatus,
} from "./analysis-status";

describe("AnalysisStatus", () => {
  it("parses a valid status", () => {
    expect(parseAnalysisStatus("QUEUED")).toBe(AnalysisStatus.Queued);
  });

  it("rejects an unknown status", () => {
    expect(() => parseAnalysisStatus("BOGUS")).toThrow(/not a valid analysis status/);
  });

  it("allows PENDING -> QUEUED -> PROCESSING -> SUCCEEDED", () => {
    expect(ALLOWED_ANALYSIS_TRANSITIONS[AnalysisStatus.Pending]).toContain(AnalysisStatus.Queued);
    expect(ALLOWED_ANALYSIS_TRANSITIONS[AnalysisStatus.Queued]).toContain(AnalysisStatus.Processing);
    expect(ALLOWED_ANALYSIS_TRANSITIONS[AnalysisStatus.Processing]).toContain(AnalysisStatus.Succeeded);
  });

  it("allows FAILED -> QUEUED (retry) but no other outgoing transition from a terminal status", () => {
    expect(ALLOWED_ANALYSIS_TRANSITIONS[AnalysisStatus.Failed]).toEqual([AnalysisStatus.Queued]);
    expect(ALLOWED_ANALYSIS_TRANSITIONS[AnalysisStatus.Succeeded]).toEqual([]);
    expect(ALLOWED_ANALYSIS_TRANSITIONS[AnalysisStatus.PartiallySucceeded]).toEqual([]);
    expect(ALLOWED_ANALYSIS_TRANSITIONS[AnalysisStatus.Cancelled]).toEqual([]);
  });

  it("allows cancellation from every non-terminal status", () => {
    expect(ALLOWED_ANALYSIS_TRANSITIONS[AnalysisStatus.Pending]).toContain(AnalysisStatus.Cancelled);
    expect(ALLOWED_ANALYSIS_TRANSITIONS[AnalysisStatus.Queued]).toContain(AnalysisStatus.Cancelled);
    expect(ALLOWED_ANALYSIS_TRANSITIONS[AnalysisStatus.Processing]).toContain(AnalysisStatus.Cancelled);
  });

  it("identifies terminal statuses", () => {
    expect(isTerminalAnalysisStatus(AnalysisStatus.Succeeded)).toBe(true);
    expect(isTerminalAnalysisStatus(AnalysisStatus.PartiallySucceeded)).toBe(true);
    expect(isTerminalAnalysisStatus(AnalysisStatus.Cancelled)).toBe(true);
    expect(isTerminalAnalysisStatus(AnalysisStatus.Failed)).toBe(false);
    expect(isTerminalAnalysisStatus(AnalysisStatus.Queued)).toBe(false);
  });
});
