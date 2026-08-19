import type { AnalysisFreshness } from "../../analysis";

/**
 * Checkpoint 2.1-P2.1-FIX-E — jamais persistée (même discipline que
 * `computeAnalysisFreshness`/`computeChecklistFreshness`/`computeGoNoGoFreshness`/
 * `computeTechnicalMemoSectionFreshness`), calculée en LECTURE SEULE à partir de la provenance
 * figée sur la `FinalApproval` ACTIVE d'un tender.
 *
 * Dimensions réellement retenues (audit ciblé avant codage) :
 * - CANDIDATE — `Tender.candidateCompanyId`, toujours comparé (universel, même motif que tous les
 *   checkpoints précédents).
 * - ANALYSIS/DCE — UNIQUEMENT si une analyse a DÉJÀ réussi pour ce tender au moment de la LECTURE
 *   (`currentAnalysisVersion !== undefined`) : reprend `GetEffectiveTenderAnalysisSummaryUseCase`
 *   tel quel (`analysisFreshness` encode déjà la comparaison DCE — jamais un second calcul
 *   divergent). Si la dimension est applicable mais que la `FinalApproval` ne porte aucune
 *   provenance analyse (ligne antérieure à ce checkpoint), le mismatch `undefined !== version`
 *   suffit à produire STALE — jamais un historique insuffisant traité comme CURRENT par défaut
 *   (mission §14).
 * - TECHNICAL MEMO — UNIQUEMENT si le tender a AU MOINS un Technical Memo au moment de la LECTURE :
 *   compare l'empreinte SHA-256 figée à l'approbation à l'empreinte recalculée maintenant (voir
 *   `GetTechnicalMemoRevisionFingerprintForTenderUseCase`, module technical-memo) — jamais un
 *   numéro de version de mémoire inventé (FIX-D a établi qu'aucune version globale de mémoire
 *   n'existe dans le modèle actuel).
 *
 * Checklist et GO/NO-GO sont délibérément ABSENTS — audit confirmé que le module `validation`
 * (pipeline `ValidationRun`/`FinalApproval`, Sprint 8A bis) ne les lit jamais, directement ou
 * indirectement : son unité de travail est un `ExportJob` (module `export`), jamais une seconde
 * dépendance fabriquée sans preuve de code.
 */
export const ValidationFreshness = { Current: "CURRENT", Stale: "STALE", Unknown: "UNKNOWN" } as const;
export type ValidationFreshness = (typeof ValidationFreshness)[keyof typeof ValidationFreshness];

export type ValidationFreshnessInput = Readonly<{
  /** `null` si aucune `FinalApproval` ACTIVE n'existe pour ce tender — mission §14 "jamais CURRENT
   *  inventé". */
  approval:
    | Readonly<{
        candidateCompanyId: string | undefined;
        analysisVersion: number | undefined;
        technicalMemoRevisionFingerprint: string | undefined;
      }>
    | null;
  currentCandidateCompanyId: string | undefined;
  /** `undefined` si AUCUNE analyse n'a jamais réussi pour ce tender — dimension non applicable,
   *  jamais une dépendance fabriquée. */
  currentAnalysisVersion: number | undefined;
  currentAnalysisFreshness: AnalysisFreshness | undefined;
  /** `undefined` si le tender n'a AUCUN Technical Memo actuellement — dimension non applicable. */
  currentTechnicalMemoRevisionFingerprint: string | undefined;
}>;

export function computeValidationFreshness(input: ValidationFreshnessInput): ValidationFreshness {
  if (!input.approval) return ValidationFreshness.Unknown;

  // Mission §16 — un changement de Candidate rend la validation STALE, que le dossier dépende ou
  // non du DCE/mémoire (l'identité candidate est TOUJOURS résolue).
  if (input.approval.candidateCompanyId !== input.currentCandidateCompanyId) {
    return ValidationFreshness.Stale;
  }

  // Mission §15/§17 — dimension applicable UNIQUEMENT si une analyse existe RÉELLEMENT aujourd'hui
  // pour ce tender (jamais fabriquée pour un tender qui n'a jamais eu de DCE analysé).
  if (input.currentAnalysisVersion !== undefined) {
    // Mission §26 (même discipline que P1-FIXC-001) — jamais CURRENT si le signal de fraîcheur de
    // l'analyse courante n'est pas lui-même résolu.
    if (input.currentAnalysisFreshness === undefined) return ValidationFreshness.Unknown;
    if (input.approval.analysisVersion !== input.currentAnalysisVersion) return ValidationFreshness.Stale;
    if (input.currentAnalysisFreshness !== "CURRENT") return ValidationFreshness.Stale;
  }

  // Mission §20 — dimension applicable UNIQUEMENT si le tender a réellement un Technical Memo
  // aujourd'hui.
  if (input.currentTechnicalMemoRevisionFingerprint !== undefined) {
    if (input.approval.technicalMemoRevisionFingerprint !== input.currentTechnicalMemoRevisionFingerprint) {
      return ValidationFreshness.Stale;
    }
  }

  return ValidationFreshness.Current;
}
