import { Alert } from "./alert.entity";
import { ChecklistItem, ChecklistItemStatus } from "./checklist-item.entity";
import { Milestone } from "./milestone.entity";
import { AwardCriterion } from "./award-criterion.entity";
import { ReadinessStatus } from "./readiness-status";
import { Risk, RiskStatus } from "./risk.entity";

/**
 * Checkpoint TENDEROS-2.1-POST-DECOM-TNR-FIX-1 (F-02) — état de la consolidation du DCE, vu par le
 * score de préparation.
 *
 * `CURRENT` reprend exactement `AnalysisFreshness.CURRENT` du contrat public Analysis. Tout le
 * reste — analyse absente, en cours, en échec, ou périmée par rapport à la révision DCE courante —
 * est traité de façon identique et volontairement conservatrice : le dossier n'est PAS prêt.
 *
 * Défaut historique corrigé ici : le score attribuait le maximum de points aux dimensions
 * « Checklist obligatoire » et « Pièces obligatoires » lorsqu'elles étaient VIDES (ratio 1 sur un
 * ensemble vide), si bien qu'un dossier où rien n'avait été fait — et dont la consolidation avait
 * échoué — atteignait 90/100 « READY ». Un ensemble vide ne compte désormais comme satisfait que
 * si une consolidation COURANTE a réellement établi qu'il l'était.
 */
export type TenderAnalysisReadinessState = "CURRENT" | "MISSING" | "PROCESSING" | "FAILED" | "STALE" | "UNKNOWN";

export type ReadinessBreakdownEntry = Readonly<{
  label: string;
  weight: number;
  achievedRatio: number;
  points: number;
}>;

export type ReadinessResult = Readonly<{
  score: number;
  status: ReadinessStatus;
  completedItems: number;
  remainingItems: number;
  criticalAlerts: number;
  warnings: number;
  breakdown: ReadinessBreakdownEntry[];
  /** Alerte critique non résolue ou risque critique non résolu — utilisé tel quel par les
   *  statistiques Kanban & List Views ("dossiers à risque") pour ne pas dupliquer ce calcul. */
  hasBlockingIssue: boolean;
}>;

/**
 * Moteur de score de préparation (mission §13) — déterministe, sans IA. Pondération : checklist
 * obligatoire 60% ; au moins un critère renseigné 10% ; aucune échéance dépassée 15% ; aucun
 * risque CRITICAL non résolu 15%.
 *
 * TENDEROS-2.1 — fusion des « Pièces demandées » dans la Checklist. Les pièces pesaient 25% dans
 * une dimension distincte, alors que l'analyse IA ne les alimentait plus depuis le V2 Sprint 6 :
 * un quart du score reposait sur une liste que plus rien ne remplissait automatiquement. Elles ont
 * été reprises en éléments de checklist (migration `20261018090000`) ; leurs 25 points rejoignent
 * donc la checklist (35 + 25 = 60). Les exigences suivies ne changent pas de poids, seulement
 * d'endroit. Un risque ou une alerte CRITICAL non résolu(e) plafonne le statut à
 * NOT_READY quel que soit le score numérique — le score n'est pas une garantie de conformité
 * juridique (mission §13).
 */
export function calculateTenderReadiness(input: {
  checklistItems: ChecklistItem[];
  criteria: AwardCriterion[];
  milestones: Milestone[];
  risks: Risk[];
  alerts: Alert[];
  /**
   * Checkpoint TENDEROS-2.1-POST-DECOM-TNR-FIX-1 (F-02) — état de la consolidation du DCE pour CE
   * tender, repris TEL QUEL du contrat public Analysis (`EffectiveTenderAnalysisSummary.
   * analysisFreshness`, même valeur que celle déjà consommée par la readiness de dépôt) : jamais un
   * second calcul de fraîcheur, jamais une seconde SOT.
   */
  analysis: TenderAnalysisReadinessState;
  /**
   * Checkpoint TENDEROS-2.1-POST-DECOM-TNR-FIX-2 (F-06) — exigences OBLIGATOIRES detectees mais
   * encore en attente de validation humaine. Tant qu'il en reste, une checklist vide traduit une
   * incertitude, jamais l'absence d'exigence : elle ne peut donc pas etre creditee.
   */
  pendingMandatoryRequirements: number;
  now: Date;
}): ReadinessResult {
  // La checklist est DÉRIVÉE de l'analyse du DCE : tant qu'aucune consolidation exploitable
  // n'existe, sa vacuité ne signifie pas « rien à faire » mais « pas encore su ». Voir `TenderAnalysisReadinessState`.
  const analysisIsCurrent = input.analysis === "CURRENT";
  // F-06 — un ensemble vide n'est satisfait que si une consolidation COURANTE l'a etabli ET
  // qu'aucune exigence obligatoire detectee n'attend encore d'etre confirmee.
  const requirementsSettled = analysisIsCurrent && input.pendingMandatoryRequirements === 0;
  const emptySetRatio = requirementsSettled ? 1 : 0;

  const requiredChecklist = input.checklistItems.filter((item) => item.required);
  const completedChecklist = requiredChecklist.filter(
    (item) => item.status === ChecklistItemStatus.Completed || item.status === ChecklistItemStatus.NotApplicable,
  );
  const checklistRatio =
    requiredChecklist.length === 0 ? emptySetRatio : completedChecklist.length / requiredChecklist.length;

  const criteriaRatio = input.criteria.length > 0 ? 1 : 0;

  const overdueMilestones = input.milestones.filter((milestone) => milestone.isOverdue(input.now));
  const milestonesRatio = input.milestones.length === 0 ? 1 : overdueMilestones.length === 0 ? 1 : 0;

  const unresolvedCriticalRisks = input.risks.filter(
    (risk) => risk.severity === "CRITICAL" && risk.status === RiskStatus.Open,
  );
  const risksRatio = unresolvedCriticalRisks.length === 0 ? 1 : 0;

  const breakdown: ReadinessBreakdownEntry[] = [
    { label: "Checklist obligatoire", weight: 60, achievedRatio: checklistRatio, points: 60 * checklistRatio },
    { label: "Critères d'attribution renseignés", weight: 10, achievedRatio: criteriaRatio, points: 10 * criteriaRatio },
    { label: "Échéances respectées", weight: 15, achievedRatio: milestonesRatio, points: 15 * milestonesRatio },
    { label: "Aucun risque critique non résolu", weight: 15, achievedRatio: risksRatio, points: 15 * risksRatio },
  ];

  const score = Math.round(breakdown.reduce((sum, entry) => sum + entry.points, 0));

  const unresolvedCriticalAlerts = input.alerts.filter((alert) => !alert.resolved && alert.severity === "CRITICAL");
  const unresolvedWarningAlerts = input.alerts.filter((alert) => !alert.resolved && alert.severity === "WARNING");

  const criticalAlerts = unresolvedCriticalAlerts.length;
  const warnings = unresolvedWarningAlerts.length + overdueMilestones.length;

  const hasBlockingIssue = criticalAlerts > 0 || unresolvedCriticalRisks.length > 0;

  let status: ReadinessStatus;
  if (hasBlockingIssue) {
    status = ReadinessStatus.NotReady;
  } else if (!requirementsSettled) {
    // Fail-closed (F-02) — sans consolidation exploitable du DCE, le score reste informatif mais le
    // STATUT ne peut jamais annoncer un dossier prêt : les exigences ne sont pas encore connues.
    // Plafonné à IN_PROGRESS, jamais READY ni READY_WITH_WARNINGS, quel que soit le score.
    status = score >= 30 ? ReadinessStatus.InProgress : ReadinessStatus.NotReady;
  } else if (score >= 90 && warnings === 0) {
    status = ReadinessStatus.Ready;
  } else if (score >= 70) {
    status = ReadinessStatus.ReadyWithWarnings;
  } else if (score >= 30) {
    status = ReadinessStatus.InProgress;
  } else {
    status = ReadinessStatus.NotReady;
  }

  return {
    score,
    status,
    completedItems: completedChecklist.length,
    remainingItems: requiredChecklist.length - completedChecklist.length,
    criticalAlerts,
    warnings,
    breakdown,
    hasBlockingIssue,
  };
}
