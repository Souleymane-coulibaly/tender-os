import type { Alert } from "../domain/alert.entity";
import type { AwardCriterion } from "../domain/award-criterion.entity";
import type { ChecklistItem } from "../domain/checklist-item.entity";
import type { Milestone } from "../domain/milestone.entity";
import { calculateTenderReadiness, type ReadinessResult } from "../domain/readiness-calculator";
import { Risk, RiskStatus } from "../domain/risk.entity";
import type { Tender } from "../domain/tender.aggregate";
import { TenderStatus } from "../domain/tender-status";

export type TenderEnrichment = Readonly<{
  readiness: ReadinessResult;
  openRisksCount: number;
  incompleteChecklistCount: number;
  overdue: boolean;
}>;

/** Mêmes statuts que le filtre `overdue` du repository (prisma-tender.repository.ts) —
 *  un dépôt déjà soumis ou un dossier clos n'est plus "en retard". */
const OVERDUE_EXEMPT_STATUSES: readonly string[] = [
  TenderStatus.Submitted,
  TenderStatus.Won,
  TenderStatus.Lost,
  TenderStatus.Archived,
];

function groupByTenderId<T extends { tenderId: string }>(items: readonly T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const group = groups.get(item.tenderId);
    if (group) {
      group.push(item);
    } else {
      groups.set(item.tenderId, [item]);
    }
  }
  return groups;
}

/**
 * Calcule, pour un lot de Tenders déjà chargés, les indicateurs de pilotage (score de
 * préparation, risques ouverts, checklist incomplète, retard) à partir de sous-ressources
 * déjà récupérées en requêtes groupées (voir *.repository.ts `listByTenderIds`) — aucune
 * requête supplémentaire ici, uniquement du calcul en mémoire réutilisant le moteur de
 * score existant (`calculateTenderReadiness`), pour éviter tout N+1 et toute duplication
 * de règle métier (mission Kanban & List Views §2, §6, §8).
 */
export function enrichTenders(input: {
  tenders: readonly Tender[];
  checklistItems: readonly ChecklistItem[];
  criteria: readonly AwardCriterion[];
  milestones: readonly Milestone[];
  risks: readonly Risk[];
  alerts: readonly Alert[];
  now: Date;
}): Map<string, TenderEnrichment> {
  const checklistByTender = groupByTenderId(input.checklistItems);
  const criteriaByTender = groupByTenderId(input.criteria);
  const milestonesByTender = groupByTenderId(input.milestones);
  const risksByTender = groupByTenderId(input.risks);
  const alertsByTender = groupByTenderId(input.alerts);

  const result = new Map<string, TenderEnrichment>();

  for (const tender of input.tenders) {
    const tenderId = tender.id.value;
    const checklistItems = checklistByTender.get(tenderId) ?? [];
    const risks = risksByTender.get(tenderId) ?? [];

    const readiness = calculateTenderReadiness({
      checklistItems,
      criteria: criteriaByTender.get(tenderId) ?? [],
      milestones: milestonesByTender.get(tenderId) ?? [],
      risks,
      alerts: alertsByTender.get(tenderId) ?? [],
      // Checkpoint TENDEROS-2.1-POST-DECOM-TNR-FIX-1 (F-02) — les vues agrégées (board, liste,
      // statistiques) ne disposent d'aucune lecture GROUPÉE de la fraîcheur de consolidation ; en
      // interroger une par tender introduirait un N+1 sur des vues de liste. L'état est donc
      // `UNKNOWN` ici, ce qui plafonne volontairement le statut à IN_PROGRESS : conservateur, jamais
      // optimiste. Le SCORE et toutes les autres métriques restent inchangés. Une lecture groupée
      // (`TenderAnalysisStateProvider.getStates`) est enregistrée en suite à donner — c'est elle qui
      // permettra à ces vues d'annoncer de nouveau READY sans requête par ligne.
      analysis: "UNKNOWN",
      // F-06 — meme raison que `analysis` : incertitude maximale sur ces vues agregees.
      pendingMandatoryRequirements: 1,
      now: input.now,
    });

    const openRisksCount = risks.filter((risk: Risk) => risk.status === RiskStatus.Open).length;
    const incompleteChecklistCount = checklistItems.filter(
      (item) => item.required && item.status !== "COMPLETED" && item.status !== "NOT_APPLICABLE",
    ).length;
    const overdue =
      tender.submissionDeadline !== undefined &&
      tender.submissionDeadline < input.now &&
      !OVERDUE_EXEMPT_STATUSES.includes(tender.status);

    result.set(tenderId, { readiness, openRisksCount, incompleteChecklistCount, overdue });
  }

  return result;
}
