/**
 * Checkpoint 2.1-P2.1-FIX-F — codes STABLES (mission §78 "chaque raison doit avoir un code
 * stable") pour la décision finale de dépôt. Un code par dimension RÉELLEMENT consommée et
 * PROUVÉE bloquante par le module source (mission §11 "prouver qu'elle est réellement requise") —
 * jamais un code pour une condition qui n'existe pas dans le modèle actuel :
 * - `RESPONSE_PACKAGE_FAILED`/`PACKAGE_APPROVAL_MISSING` (suggérés par la mission) sont
 *   VOLONTAIREMENT absents : `ResponsePackageVersion` n'a pas d'état FAILED dans le modèle actuel
 *   (DRAFT/IN_REVIEW/VALIDATED seulement), et `ApprovalRequest(RESPONSE_PACKAGE_VERSION)` n'est
 *   jamais un prérequis contraignant aujourd'hui (audit FIX-F confirmé : purement collaboratif).
 * - `ADMIN_DOCUMENT_*`/`FINANCIAL_DOCUMENT_*` sont VOLONTAIREMENT absents en tant que dimensions
 *   séparées : ils sont déjà couverts par la complétude du Response Package
 *   (`RESPONSE_PACKAGE_INCOMPLETE`), qui embarque déjà les pièces administratives/financières comme
 *   `PackageItem` — un second moteur de complétude administrative/financière serait un calcul
 *   divergent (mission "jamais dupliquer les moteurs de freshness").
 */
export const SubmissionReadinessReasonCode = {
  CandidateMissing: "CANDIDATE_MISSING",
  AnalysisMissing: "ANALYSIS_MISSING",
  AnalysisStale: "ANALYSIS_STALE",
  AnalysisUnknown: "ANALYSIS_UNKNOWN",
  ChecklistStale: "CHECKLIST_STALE",
  GoNoGoStale: "GONOGO_STALE",
  GoNoGoUnknown: "GONOGO_UNKNOWN",
  GoNoGoNoGo: "GONOGO_NO_GO",
  TechnicalMemoStale: "TECHNICAL_MEMO_STALE",
  TechnicalMemoUnknown: "TECHNICAL_MEMO_UNKNOWN",
  ValidationMissing: "VALIDATION_MISSING",
  ValidationStale: "VALIDATION_STALE",
  ValidationUnknown: "VALIDATION_UNKNOWN",
  ResponsePackageMissing: "RESPONSE_PACKAGE_MISSING",
  ResponsePackageStale: "RESPONSE_PACKAGE_STALE",
  ResponsePackageUnknown: "RESPONSE_PACKAGE_UNKNOWN",
  ResponsePackageIncomplete: "RESPONSE_PACKAGE_INCOMPLETE",
} as const;
export type SubmissionReadinessReasonCode = (typeof SubmissionReadinessReasonCode)[keyof typeof SubmissionReadinessReasonCode];

export const SubmissionReadinessReasonSeverity = { Blocking: "BLOCKING", Warning: "WARNING", Informational: "INFORMATIONAL" } as const;
export type SubmissionReadinessReasonSeverity = (typeof SubmissionReadinessReasonSeverity)[keyof typeof SubmissionReadinessReasonSeverity];

export const SubmissionReadinessReasonSource = {
  Candidate: "CANDIDATE",
  Analysis: "ANALYSIS",
  Checklist: "CHECKLIST",
  GoNoGo: "GO_NO_GO",
  TechnicalMemo: "TECHNICAL_MEMO",
  Validation: "VALIDATION",
  ResponsePackage: "RESPONSE_PACKAGE",
} as const;
export type SubmissionReadinessReasonSource = (typeof SubmissionReadinessReasonSource)[keyof typeof SubmissionReadinessReasonSource];

/** Mission §80 — action structurée optionnelle, jamais une URL frontend (mission §81 "le frontend
 *  mappe action → route"). */
export const SubmissionReadinessAction = {
  ReanalyzeDce: "REANALYZE_DCE",
  ReconcileChecklist: "RECONCILE_CHECKLIST",
  RecalculateGoNoGo: "RECALCULATE_GONOGO",
  RegenerateTechnicalMemo: "REGENERATE_TECHNICAL_MEMO",
  Revalidate: "REVALIDATE",
  RegenerateResponsePackage: "REGENERATE_RESPONSE_PACKAGE",
} as const;
export type SubmissionReadinessAction = (typeof SubmissionReadinessAction)[keyof typeof SubmissionReadinessAction];

/** Mission §79 — forme structurée d'une raison. */
export type SubmissionReadinessReason = Readonly<{
  code: SubmissionReadinessReasonCode;
  severity: SubmissionReadinessReasonSeverity;
  source: SubmissionReadinessReasonSource;
  message: string;
  action?: SubmissionReadinessAction | undefined;
}>;

/** Mission §131-133 — ordre déterministe fixe, jamais une itération de Map/résultat DB/ordre de
 *  résolution de Promise. Reflète l'ordre suggéré (§132) : Candidate → DCE/Analysis → Checklist →
 *  GO/NO-GO → Technical Memo → Validation → Response Package. */
const REASON_ORDER: readonly SubmissionReadinessReasonCode[] = [
  SubmissionReadinessReasonCode.CandidateMissing,
  SubmissionReadinessReasonCode.AnalysisMissing,
  SubmissionReadinessReasonCode.AnalysisStale,
  SubmissionReadinessReasonCode.AnalysisUnknown,
  SubmissionReadinessReasonCode.ChecklistStale,
  SubmissionReadinessReasonCode.GoNoGoStale,
  SubmissionReadinessReasonCode.GoNoGoUnknown,
  SubmissionReadinessReasonCode.GoNoGoNoGo,
  SubmissionReadinessReasonCode.TechnicalMemoStale,
  SubmissionReadinessReasonCode.TechnicalMemoUnknown,
  SubmissionReadinessReasonCode.ValidationMissing,
  SubmissionReadinessReasonCode.ValidationStale,
  SubmissionReadinessReasonCode.ValidationUnknown,
  SubmissionReadinessReasonCode.ResponsePackageMissing,
  SubmissionReadinessReasonCode.ResponsePackageStale,
  SubmissionReadinessReasonCode.ResponsePackageUnknown,
  SubmissionReadinessReasonCode.ResponsePackageIncomplete,
];

export function sortSubmissionReadinessReasons(reasons: readonly SubmissionReadinessReason[]): SubmissionReadinessReason[] {
  return [...reasons].sort((a, b) => REASON_ORDER.indexOf(a.code) - REASON_ORDER.indexOf(b.code));
}
