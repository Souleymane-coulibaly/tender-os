import { SubmissionReadinessAction, SubmissionReadinessReasonCode, SubmissionReadinessReasonSeverity, SubmissionReadinessReasonSource, sortSubmissionReadinessReasons, type SubmissionReadinessReason } from "./submission-readiness-reason";

export type FileReadinessInput = Readonly<{
  candidateCompanyId: string | undefined;
  /** `exists: false` si aucune analyse n'a jamais réussi pour ce tender. */
  analysis: Readonly<{ exists: boolean; freshness: "CURRENT" | "STALE" | "UNKNOWN" | undefined }>;
  /** Toujours résolue (même sans analyse — voir `GetChecklistFreshnessUseCase`, jamais un 404). */
  checklist: Readonly<{ freshness: "CURRENT" | "RECONCILIATION_REQUIRED" }>;
  /** `exists: false` si aucun rapport GO/NO-GO n'a jamais été généré (jamais requis, mission §34
   *  "PROUVER" — aucune règle existante ne l'exige, voir audit). */
  goNoGo: Readonly<{ exists: boolean; freshness: "CURRENT" | "STALE" | "UNKNOWN" | undefined; recommendation: "GO" | "GO_CONDITIONAL" | "NO_GO" | undefined }>;
  /** `exists: false` si le tender n'a AUCUN Technical Memo — jamais requis dans ce cas (mission
   *  §39). `freshness` est le PIRE signal parmi tous les mémoires du tender s'il y en a plusieurs. */
  technicalMemo: Readonly<{ exists: boolean; freshness: "CURRENT" | "STALE" | "UNKNOWN" | undefined }>;
  validation: Readonly<{ hasActiveApproval: boolean; freshness: "CURRENT" | "STALE" | "UNKNOWN" }>;
  /** `exists: false` si le tender n'a AUCUN Response Package — TOUJOURS requis (mission §63, c'est
   *  littéralement le dossier final). `isCurrentVersionValidated` est `undefined` s'il n'y a aucune
   *  version courante du tout. */
  responsePackage: Readonly<{ exists: boolean; freshness: "CURRENT" | "STALE" | "UNKNOWN" | undefined; isCurrentVersionValidated: boolean | undefined }>;
}>;

/**
 * Checkpoint 2.1-P2.1-FIX-F — fonction PURE, aucune E/S : classifie l'état DÉJÀ RÉSOLU par les
 * autorités métier existantes (mission §1 "FIX-F est un AGRÉGATEUR FINAL, pas un nouveau moteur de
 * freshness") en raisons structurées BLOCKING/WARNING/INFORMATIONAL. Jamais un recalcul de
 * freshness ici — uniquement une classification de ce que les use cases sources ont déjà répondu.
 */
export function evaluateFileReadinessReasons(input: FileReadinessInput): SubmissionReadinessReason[] {
  const reasons: SubmissionReadinessReason[] = [];

  // Mission §17-19 — un Tender engagé dans ce parcours (readiness au dépôt) doit avoir une
  // CandidateCompany résolue : jamais un fallback silencieux vers ClientAccount (mission §18).
  if (input.candidateCompanyId === undefined) {
    reasons.push({
      code: SubmissionReadinessReasonCode.CandidateMissing,
      severity: SubmissionReadinessReasonSeverity.Blocking,
      source: SubmissionReadinessReasonSource.Candidate,
      message: "Aucune entreprise candidate n'est résolue pour ce dossier.",
    });
  }

  // Mission §24-27 — Analysis.
  if (!input.analysis.exists) {
    reasons.push({
      code: SubmissionReadinessReasonCode.AnalysisMissing,
      severity: SubmissionReadinessReasonSeverity.Blocking,
      source: SubmissionReadinessReasonSource.Analysis,
      message: "Aucune analyse du DCE n'a encore réussi pour ce dossier.",
      action: SubmissionReadinessAction.ReanalyzeDce,
    });
  } else if (input.analysis.freshness === "STALE") {
    reasons.push({
      code: SubmissionReadinessReasonCode.AnalysisStale,
      severity: SubmissionReadinessReasonSeverity.Blocking,
      source: SubmissionReadinessReasonSource.Analysis,
      message: "L'analyse du DCE n'est plus à jour par rapport au DCE courant.",
      action: SubmissionReadinessAction.ReanalyzeDce,
    });
  } else if (input.analysis.freshness === "UNKNOWN" || input.analysis.freshness === undefined) {
    reasons.push({
      code: SubmissionReadinessReasonCode.AnalysisUnknown,
      severity: SubmissionReadinessReasonSeverity.Blocking,
      source: SubmissionReadinessReasonSource.Analysis,
      message: "La fraîcheur de l'analyse du DCE ne peut pas être déterminée.",
      action: SubmissionReadinessAction.ReanalyzeDce,
    });
  }

  // Mission §28-32 — Checklist.
  if (input.checklist.freshness === "RECONCILIATION_REQUIRED") {
    reasons.push({
      code: SubmissionReadinessReasonCode.ChecklistStale,
      severity: SubmissionReadinessReasonSeverity.Blocking,
      source: SubmissionReadinessReasonSource.Checklist,
      message: "La checklist n'a pas été réconciliée avec la dernière analyse.",
      action: SubmissionReadinessAction.ReconcileChecklist,
    });
  }

  // Mission §33-37 — GO/NO-GO : jamais requis en soi (aucun rapport = pas de dimension bloquante,
  // audit confirmé qu'aucune règle métier existante ne l'exige). NO_GO reste INFORMATIONAL/WARNING
  // — jamais un blocage inventé (mission §34 "PROUVER dans le code", aucune preuve trouvée).
  if (input.goNoGo.exists) {
    if (input.goNoGo.freshness === "STALE") {
      reasons.push({
        code: SubmissionReadinessReasonCode.GoNoGoStale,
        severity: SubmissionReadinessReasonSeverity.Blocking,
        source: SubmissionReadinessReasonSource.GoNoGo,
        message: "Le rapport GO/NO-GO n'est plus à jour par rapport au dossier courant.",
        action: SubmissionReadinessAction.RecalculateGoNoGo,
      });
    } else if (input.goNoGo.freshness === "UNKNOWN") {
      reasons.push({
        code: SubmissionReadinessReasonCode.GoNoGoUnknown,
        severity: SubmissionReadinessReasonSeverity.Blocking,
        source: SubmissionReadinessReasonSource.GoNoGo,
        message: "La fraîcheur du rapport GO/NO-GO ne peut pas être déterminée.",
        action: SubmissionReadinessAction.RecalculateGoNoGo,
      });
    }
    if (input.goNoGo.recommendation === "NO_GO") {
      reasons.push({
        code: SubmissionReadinessReasonCode.GoNoGoNoGo,
        severity: SubmissionReadinessReasonSeverity.Warning,
        source: SubmissionReadinessReasonSource.GoNoGo,
        message: "La dernière recommandation GO/NO-GO était NO-GO.",
      });
    }
  }

  // Mission §38-43 — Technical Memo : jamais requis pour un Tender qui n'en a aucun (mission §39).
  if (input.technicalMemo.exists) {
    if (input.technicalMemo.freshness === "STALE") {
      reasons.push({
        code: SubmissionReadinessReasonCode.TechnicalMemoStale,
        severity: SubmissionReadinessReasonSeverity.Blocking,
        source: SubmissionReadinessReasonSource.TechnicalMemo,
        message: "Le mémoire technique n'est plus à jour par rapport au dossier courant.",
        action: SubmissionReadinessAction.RegenerateTechnicalMemo,
      });
    } else if (input.technicalMemo.freshness === "UNKNOWN") {
      reasons.push({
        code: SubmissionReadinessReasonCode.TechnicalMemoUnknown,
        severity: SubmissionReadinessReasonSeverity.Blocking,
        source: SubmissionReadinessReasonSource.TechnicalMemo,
        message: "La fraîcheur du mémoire technique ne peut pas être déterminée (section jamais générée).",
        action: SubmissionReadinessAction.RegenerateTechnicalMemo,
      });
    }
  }

  // Mission §57-61 — Validation : FinalApproval ne doit jamais devenir une "god validation" — les
  // AUTRES dimensions restent contrôlées séparément ci-dessus/ci-dessous, jamais court-circuitées
  // par un `Validation CURRENT` seul.
  if (!input.validation.hasActiveApproval) {
    reasons.push({
      code: SubmissionReadinessReasonCode.ValidationMissing,
      severity: SubmissionReadinessReasonSeverity.Blocking,
      source: SubmissionReadinessReasonSource.Validation,
      message: "Aucune approbation finale active n'existe pour ce dossier.",
      action: SubmissionReadinessAction.Revalidate,
    });
  } else if (input.validation.freshness === "STALE") {
    reasons.push({
      code: SubmissionReadinessReasonCode.ValidationStale,
      severity: SubmissionReadinessReasonSeverity.Blocking,
      source: SubmissionReadinessReasonSource.Validation,
      message: "L'approbation finale active n'est plus à jour par rapport au dossier courant.",
      action: SubmissionReadinessAction.Revalidate,
    });
  } else if (input.validation.freshness === "UNKNOWN") {
    reasons.push({
      code: SubmissionReadinessReasonCode.ValidationUnknown,
      severity: SubmissionReadinessReasonSeverity.Blocking,
      source: SubmissionReadinessReasonSource.Validation,
      message: "La fraîcheur de l'approbation finale active ne peut pas être déterminée.",
      action: SubmissionReadinessAction.Revalidate,
    });
  }

  // Mission §62-69 — Response Package : TOUJOURS requis (c'est le dossier final lui-même).
  if (!input.responsePackage.exists) {
    reasons.push({
      code: SubmissionReadinessReasonCode.ResponsePackageMissing,
      severity: SubmissionReadinessReasonSeverity.Blocking,
      source: SubmissionReadinessReasonSource.ResponsePackage,
      message: "Aucun dossier de réponse final n'a encore été construit.",
      action: SubmissionReadinessAction.RegenerateResponsePackage,
    });
  } else {
    if (input.responsePackage.freshness === "STALE") {
      reasons.push({
        code: SubmissionReadinessReasonCode.ResponsePackageStale,
        severity: SubmissionReadinessReasonSeverity.Blocking,
        source: SubmissionReadinessReasonSource.ResponsePackage,
        message: "Le dossier de réponse final n'est plus à jour par rapport aux pièces attendues.",
        action: SubmissionReadinessAction.RegenerateResponsePackage,
      });
    } else if (input.responsePackage.freshness === "UNKNOWN") {
      reasons.push({
        code: SubmissionReadinessReasonCode.ResponsePackageUnknown,
        severity: SubmissionReadinessReasonSeverity.Blocking,
        source: SubmissionReadinessReasonSource.ResponsePackage,
        message: "La fraîcheur du dossier de réponse final ne peut pas être déterminée.",
        action: SubmissionReadinessAction.RegenerateResponsePackage,
      });
    }
    if (input.responsePackage.isCurrentVersionValidated === false) {
      reasons.push({
        code: SubmissionReadinessReasonCode.ResponsePackageIncomplete,
        severity: SubmissionReadinessReasonSeverity.Blocking,
        source: SubmissionReadinessReasonSource.ResponsePackage,
        message: "La version courante du dossier de réponse n'est pas encore validée.",
        action: SubmissionReadinessAction.RegenerateResponsePackage,
      });
    }
  }

  return sortSubmissionReadinessReasons(reasons);
}
