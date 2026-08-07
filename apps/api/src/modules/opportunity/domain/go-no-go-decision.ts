import { GoNoGoDecisionConditionsRequiredError, GoNoGoDecisionJustificationRequiredError, InvalidGoNoGoDecisionError } from "./errors";
import { OpportunityStatus } from "./opportunity-status";

export const GoNoGoDecisionLevel = {
  Opportunity: "OPPORTUNITY",
  Tender: "TENDER",
} as const;
export type GoNoGoDecisionLevel = (typeof GoNoGoDecisionLevel)[keyof typeof GoNoGoDecisionLevel];

/** Mission §17 — TOUJOURS distincte de la recommandation IA (`GoNoGoReportResult.recommendation`),
 *  jamais auto-appliquée : seule une action humaine explicite crée une `GoNoGoDecision`. */
export const GoNoGoDecisionValue = {
  Go: "GO",
  GoConditional: "GO_CONDITIONAL",
  NoGo: "NO_GO",
} as const;
export type GoNoGoDecisionValue = (typeof GoNoGoDecisionValue)[keyof typeof GoNoGoDecisionValue];

const GO_NO_GO_DECISION_VALUES = new Set<string>(Object.values(GoNoGoDecisionValue));

export function parseGoNoGoDecisionValue(value: string): GoNoGoDecisionValue {
  if (!GO_NO_GO_DECISION_VALUES.has(value)) {
    throw new InvalidGoNoGoDecisionError(value);
  }
  return value as GoNoGoDecisionValue;
}

/** Mission §18 — règle non-négociable, appliquée AU NIVEAU DOMAINE (jamais seulement une contrainte
 *  DB) : justification obligatoire pour NO_GO, conditions obligatoires pour GO_CONDITIONAL. Une
 *  chaîne vide/blanche ne compte jamais comme renseignée. */
export function assertValidGoNoGoDecisionInput(input: { decision: GoNoGoDecisionValue; justification?: string | undefined; conditions?: string | undefined }): void {
  if (input.decision === GoNoGoDecisionValue.NoGo && !input.justification?.trim()) {
    throw new GoNoGoDecisionJustificationRequiredError();
  }
  if (input.decision === GoNoGoDecisionValue.GoConditional && !input.conditions?.trim()) {
    throw new GoNoGoDecisionConditionsRequiredError();
  }
}

/** Statut `Opportunity` correspondant à une décision de Niveau OPPORTUNITY — synchronisation
 *  atomique (mission §5, `RecordOpportunityGoNoGoDecisionUseCase`) ; le Niveau TENDER n'a PAS
 *  d'équivalent (le statut `Tender` n'est jamais touché par une `GoNoGoDecision`, mission §18). */
const OPPORTUNITY_STATUS_BY_DECISION: Record<GoNoGoDecisionValue, OpportunityStatus> = {
  [GoNoGoDecisionValue.Go]: OpportunityStatus.Go,
  [GoNoGoDecisionValue.GoConditional]: OpportunityStatus.GoConditional,
  [GoNoGoDecisionValue.NoGo]: OpportunityStatus.NoGo,
};

export function opportunityStatusForDecision(decision: GoNoGoDecisionValue): OpportunityStatus {
  return OPPORTUNITY_STATUS_BY_DECISION[decision];
}
