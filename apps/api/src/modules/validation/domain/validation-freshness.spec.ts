import { describe, expect, it } from "vitest";
import { computeValidationFreshness, ValidationFreshness } from "./validation-freshness";

describe("computeValidationFreshness (Checkpoint 2.1-P2.1-FIX-E)", () => {
  it("UNKNOWN when no active approval exists", () => {
    const result = computeValidationFreshness({
      approval: null,
      currentCandidateCompanyId: "candidate-alpha",
      currentAnalysisVersion: undefined,
      currentAnalysisFreshness: undefined,
      currentTechnicalMemoRevisionFingerprint: undefined,
    });
    expect(result).toBe(ValidationFreshness.Unknown);
  });

  it("CURRENT when candidate matches and no analysis/memo dependency currently applies", () => {
    const result = computeValidationFreshness({
      approval: { candidateCompanyId: "candidate-alpha", analysisVersion: undefined, technicalMemoRevisionFingerprint: undefined },
      currentCandidateCompanyId: "candidate-alpha",
      currentAnalysisVersion: undefined,
      currentAnalysisFreshness: undefined,
      currentTechnicalMemoRevisionFingerprint: undefined,
    });
    expect(result).toBe(ValidationFreshness.Current);
  });

  // BLOQUANT (mission §16) — un changement de Candidate rend la validation STALE.
  it("BLOQUANT — STALE when the Tender's current candidate differs from the one captured at approval", () => {
    const result = computeValidationFreshness({
      approval: { candidateCompanyId: "candidate-alpha", analysisVersion: undefined, technicalMemoRevisionFingerprint: undefined },
      currentCandidateCompanyId: "candidate-beta",
      currentAnalysisVersion: undefined,
      currentAnalysisFreshness: undefined,
      currentTechnicalMemoRevisionFingerprint: undefined,
    });
    expect(result).toBe(ValidationFreshness.Stale);
  });

  // BLOQUANT (mission §15) — une approbation historique sans provenance analyse (ligne
  // pré-checkpoint) n'est JAMAIS silencieusement CURRENT une fois qu'une analyse existe réellement
  // aujourd'hui pour ce tender.
  it("BLOQUANT — STALE (never silently CURRENT) when analysis currently exists but the approval never captured a version (pre-checkpoint row)", () => {
    const result = computeValidationFreshness({
      approval: { candidateCompanyId: undefined, analysisVersion: undefined, technicalMemoRevisionFingerprint: undefined },
      currentCandidateCompanyId: undefined,
      currentAnalysisVersion: 2,
      currentAnalysisFreshness: "CURRENT",
      currentTechnicalMemoRevisionFingerprint: undefined,
    });
    expect(result).toBe(ValidationFreshness.Stale);
  });

  // BLOQUANT (mission §17) — le DCE a changé depuis l'approbation (analyse devenue STALE) : la
  // validation devient STALE même si `analysisVersion` capturé correspond toujours à la dernière
  // analyse.
  it("BLOQUANT — STALE when the captured analysisVersion is still the latest but that analysis itself has become STALE (DCE changed)", () => {
    const result = computeValidationFreshness({
      approval: { candidateCompanyId: undefined, analysisVersion: 2, technicalMemoRevisionFingerprint: undefined },
      currentCandidateCompanyId: undefined,
      currentAnalysisVersion: 2,
      currentAnalysisFreshness: "STALE",
      currentTechnicalMemoRevisionFingerprint: undefined,
    });
    expect(result).toBe(ValidationFreshness.Stale);
  });

  it("UNKNOWN when analysis currently exists but its own freshness signal cannot be resolved (same discipline as P1-FIXC-001)", () => {
    const result = computeValidationFreshness({
      approval: { candidateCompanyId: undefined, analysisVersion: 2, technicalMemoRevisionFingerprint: undefined },
      currentCandidateCompanyId: undefined,
      currentAnalysisVersion: 2,
      currentAnalysisFreshness: undefined,
      currentTechnicalMemoRevisionFingerprint: undefined,
    });
    expect(result).toBe(ValidationFreshness.Unknown);
  });

  it("CURRENT when the captured analysisVersion matches the current one and it is itself CURRENT", () => {
    const result = computeValidationFreshness({
      approval: { candidateCompanyId: undefined, analysisVersion: 3, technicalMemoRevisionFingerprint: undefined },
      currentCandidateCompanyId: undefined,
      currentAnalysisVersion: 3,
      currentAnalysisFreshness: "CURRENT",
      currentTechnicalMemoRevisionFingerprint: undefined,
    });
    expect(result).toBe(ValidationFreshness.Current);
  });

  // BLOQUANT (mission §20) — le Technical Memo a changé après l'approbation (nouvelle révision de
  // section) : la validation devient STALE, jamais silencieusement CURRENT.
  it("BLOQUANT — STALE when the technical memo's content fingerprint has changed since the approval", () => {
    const result = computeValidationFreshness({
      approval: { candidateCompanyId: undefined, analysisVersion: undefined, technicalMemoRevisionFingerprint: "fp-1" },
      currentCandidateCompanyId: undefined,
      currentAnalysisVersion: undefined,
      currentAnalysisFreshness: undefined,
      currentTechnicalMemoRevisionFingerprint: "fp-2",
    });
    expect(result).toBe(ValidationFreshness.Stale);
  });

  it("CURRENT when the technical memo's content fingerprint is unchanged since the approval", () => {
    const result = computeValidationFreshness({
      approval: { candidateCompanyId: undefined, analysisVersion: undefined, technicalMemoRevisionFingerprint: "fp-1" },
      currentCandidateCompanyId: undefined,
      currentAnalysisVersion: undefined,
      currentAnalysisFreshness: undefined,
      currentTechnicalMemoRevisionFingerprint: "fp-1",
    });
    expect(result).toBe(ValidationFreshness.Current);
  });

  it("does not penalize a tender with no technical memo at all (dimension not applicable)", () => {
    const result = computeValidationFreshness({
      approval: { candidateCompanyId: undefined, analysisVersion: undefined, technicalMemoRevisionFingerprint: undefined },
      currentCandidateCompanyId: undefined,
      currentAnalysisVersion: undefined,
      currentAnalysisFreshness: undefined,
      currentTechnicalMemoRevisionFingerprint: undefined,
    });
    expect(result).toBe(ValidationFreshness.Current);
  });
});
