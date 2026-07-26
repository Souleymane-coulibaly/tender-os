import { Alert } from "./alert.entity";
import { ChecklistItem, ChecklistItemStatus } from "./checklist-item.entity";
import { Milestone } from "./milestone.entity";
import { AwardCriterion } from "./award-criterion.entity";
import { ReadinessStatus } from "./readiness-status";
import { RequestedDocument, RequestedDocumentStatus } from "./requested-document.entity";
import { Risk, RiskStatus } from "./risk.entity";

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
}>;

/**
 * Moteur de score de préparation (mission §13) — déterministe, sans IA. Pondération
 * proposée par moi (non documentée) : checklist obligatoire 35% ; pièces obligatoires 25% ;
 * au moins un critère renseigné 10% ; aucune échéance dépassée 15% ; aucun risque CRITICAL
 * non résolu 15%. Un risque ou une alerte CRITICAL non résolu(e) plafonne le statut à
 * NOT_READY quel que soit le score numérique — le score n'est pas une garantie de conformité
 * juridique (mission §13).
 */
export function calculateTenderReadiness(input: {
  checklistItems: ChecklistItem[];
  requestedDocuments: RequestedDocument[];
  criteria: AwardCriterion[];
  milestones: Milestone[];
  risks: Risk[];
  alerts: Alert[];
  now: Date;
}): ReadinessResult {
  const requiredChecklist = input.checklistItems.filter((item) => item.required);
  const completedChecklist = requiredChecklist.filter(
    (item) => item.status === ChecklistItemStatus.Completed || item.status === ChecklistItemStatus.NotApplicable,
  );
  const checklistRatio = requiredChecklist.length === 0 ? 1 : completedChecklist.length / requiredChecklist.length;

  const requiredDocuments = input.requestedDocuments.filter((doc) => doc.required);
  const satisfiedDocuments = requiredDocuments.filter(
    (doc) => doc.status === RequestedDocumentStatus.Provided || doc.status === RequestedDocumentStatus.Validated,
  );
  const documentsRatio =
    requiredDocuments.length === 0 ? 1 : satisfiedDocuments.length / requiredDocuments.length;

  const criteriaRatio = input.criteria.length > 0 ? 1 : 0;

  const overdueMilestones = input.milestones.filter((milestone) => milestone.isOverdue(input.now));
  const milestonesRatio = input.milestones.length === 0 ? 1 : overdueMilestones.length === 0 ? 1 : 0;

  const unresolvedCriticalRisks = input.risks.filter(
    (risk) => risk.severity === "CRITICAL" && risk.status === RiskStatus.Open,
  );
  const risksRatio = unresolvedCriticalRisks.length === 0 ? 1 : 0;

  const breakdown: ReadinessBreakdownEntry[] = [
    { label: "Checklist obligatoire", weight: 35, achievedRatio: checklistRatio, points: 35 * checklistRatio },
    { label: "Pièces obligatoires", weight: 25, achievedRatio: documentsRatio, points: 25 * documentsRatio },
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
    completedItems: completedChecklist.length + satisfiedDocuments.length,
    remainingItems:
      requiredChecklist.length - completedChecklist.length + (requiredDocuments.length - satisfiedDocuments.length),
    criticalAlerts,
    warnings,
    breakdown,
  };
}
