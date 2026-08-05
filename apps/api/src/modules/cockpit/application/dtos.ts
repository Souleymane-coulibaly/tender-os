/**
 * Mission Sprint 8A.2 — Cockpit Bid Manager. Module en aval de Documents/DCE/Analysis/Pricing/
 * Deliverables/Signature/Export/Validation/Submission-Package (jamais importé par eux, voir
 * `cockpit.module.ts`) : agrège leurs API publiques en LECTURE SEULE, ne recalcule et ne duplique
 * AUCUNE règle métier source (le statut de signature, par exemple, dérive directement de
 * `ReadinessStatus` déjà calculé par Validation — jamais une seconde dérivation).
 */

export const CockpitModuleKey = {
  Dce: "DCE",
  Analysis: "ANALYSIS",
  Pricing: "PRICING",
  Deliverables: "DELIVERABLES",
  Export: "EXPORT",
  Validation: "VALIDATION",
  Signature: "SIGNATURE",
  Package: "PACKAGE",
  /** Sprint 9 — distinct de `Package` (l'artefact généré) : le SUIVI du dépôt manuel réel
   *  (déclaré/preuve/reçu), jamais confondu avec la simple existence d'un package. */
  Submission: "SUBMISSION",
} as const;
export type CockpitModuleKey = (typeof CockpitModuleKey)[keyof typeof CockpitModuleKey];

/** `NOT_APPLICABLE` distingue "cette étape ne concerne pas ce dossier" (ex. aucune signature
 *  détectée) de `NOT_STARTED` ("concerne ce dossier mais rien n'a encore été fait") — jamais la
 *  même sémantique, pour ne jamais afficher un blocage inventé (même discipline que
 *  `deriveApprovedReadiness`, Validation, mission Sprint 8A.2 correction bug #5). */
export const CockpitModuleStatus = {
  NotStarted: "NOT_STARTED",
  InProgress: "IN_PROGRESS",
  Attention: "ATTENTION",
  Done: "DONE",
  NotApplicable: "NOT_APPLICABLE",
} as const;
export type CockpitModuleStatus = (typeof CockpitModuleStatus)[keyof typeof CockpitModuleStatus];

export const CockpitStep = {
  Discovery: "DISCOVERY",
  Analysis: "ANALYSIS",
  Preparation: "PREPARATION",
  Validation: "VALIDATION",
  Signature: "SIGNATURE",
  Submission: "SUBMISSION",
  Done: "DONE",
} as const;
export type CockpitStep = (typeof CockpitStep)[keyof typeof CockpitStep];

export const CockpitNextAction = {
  InitializeDce: "INITIALIZE_DCE",
  ImportDocuments: "IMPORT_DOCUMENTS",
  RunAnalysis: "RUN_ANALYSIS",
  CompleteDeliverables: "COMPLETE_DELIVERABLES",
  CreatePricingEstimate: "CREATE_PRICING_ESTIMATE",
  PreviewExport: "PREVIEW_EXPORT",
  RunValidation: "RUN_VALIDATION",
  ResolveBlockingIssues: "RESOLVE_BLOCKING_ISSUES",
  ApproveFinalVersion: "APPROVE_FINAL_VERSION",
  StartSignature: "START_SIGNATURE",
  FollowSignature: "FOLLOW_SIGNATURE",
  CreatePackage: "CREATE_PACKAGE",
  /** Sprint 9 — mission §26 : prochaines actions déterministes du suivi de dépôt, jamais une
   *  réponse IA libre. */
  DownloadPackage: "DOWNLOAD_PACKAGE",
  SubmitPackage: "SUBMIT_PACKAGE",
  RecordSubmissionProof: "RECORD_SUBMISSION_PROOF",
  ConfirmReceipt: "CONFIRM_RECEIPT",
  FixTechnicalRejection: "FIX_TECHNICAL_REJECTION",
  None: "NONE",
} as const;
export type CockpitNextAction = (typeof CockpitNextAction)[keyof typeof CockpitNextAction];

export const CockpitAlertLevel = {
  Blocker: "BLOCKER",
  Warning: "WARNING",
  Info: "INFO",
} as const;
export type CockpitAlertLevel = (typeof CockpitAlertLevel)[keyof typeof CockpitAlertLevel];

export type CockpitAlert = Readonly<{
  level: CockpitAlertLevel;
  /** Code stable, jamais un texte brut — le frontend porte le libellé français (même discipline
   *  que `GENERATION_CAPABILITY_REASON_LABELS`, mission Sprint 8A.2 correction bug #10). */
  code: string;
}>;

export type CockpitModuleSummary = Readonly<{
  key: CockpitModuleKey;
  status: CockpitModuleStatus;
  /** Fait brut, jamais un jugement (ex. "3/9"), utile pour un badge de comptage — le libellé
   *  complet reste porté par `key`+`status` côté frontend. */
  count?: number | undefined;
  total?: number | undefined;
}>;

export type TenderCockpitResult = Readonly<{
  tenderId: string;
  currentStep: CockpitStep;
  nextAction: CockpitNextAction;
  modules: readonly CockpitModuleSummary[];
  alerts: readonly CockpitAlert[];
}>;
