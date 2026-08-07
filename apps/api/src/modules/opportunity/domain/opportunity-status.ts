import { InvalidOpportunityStatusError } from "./errors";

/**
 * Statuts de préqualification (mission Sprint 5 §5). DRAFT/TO_QUALIFY/QUALIFIED forment le funnel
 * amont ; GO/GO_CONDITIONAL/NO_GO reflètent la DERNIÈRE `GoNoGoDecision` enregistrée (mission §18)
 * — ces trois transitions ne sont JAMAIS déclenchées par `ChangeOpportunityStatusUseCase`
 * (mouvements du funnel amont uniquement), seulement par `RecordOpportunityGoNoGoDecisionUseCase`
 * appelant directement `Opportunity.changeStatus`. PROMOTED est strictement terminal (aucune
 * transition sortante) — atteint uniquement via `PromoteOpportunityToTenderUseCase`. DISMISSED est
 * une sortie manuelle ("on ne donne pas suite"), distincte d'un NO_GO (décision motivée après
 * analyse). ARCHIVED redevient DRAFT via restauration (même motif que `TenderStatus`).
 */
export const OpportunityStatus = {
  Draft: "DRAFT",
  ToQualify: "TO_QUALIFY",
  Qualified: "QUALIFIED",
  Go: "GO",
  GoConditional: "GO_CONDITIONAL",
  NoGo: "NO_GO",
  Promoted: "PROMOTED",
  Dismissed: "DISMISSED",
  Archived: "ARCHIVED",
} as const;

export type OpportunityStatus = (typeof OpportunityStatus)[keyof typeof OpportunityStatus];

export const ALLOWED_OPPORTUNITY_TRANSITIONS: Record<OpportunityStatus, readonly OpportunityStatus[]> = {
  [OpportunityStatus.Draft]: [OpportunityStatus.ToQualify, OpportunityStatus.Dismissed, OpportunityStatus.Archived],
  [OpportunityStatus.ToQualify]: [
    OpportunityStatus.Qualified,
    OpportunityStatus.Draft,
    OpportunityStatus.Dismissed,
    OpportunityStatus.Archived,
  ],
  [OpportunityStatus.Qualified]: [
    OpportunityStatus.Go,
    OpportunityStatus.GoConditional,
    OpportunityStatus.NoGo,
    OpportunityStatus.ToQualify,
    OpportunityStatus.Dismissed,
    OpportunityStatus.Archived,
  ],
  [OpportunityStatus.Go]: [
    OpportunityStatus.GoConditional,
    OpportunityStatus.NoGo,
    OpportunityStatus.Promoted,
    OpportunityStatus.Dismissed,
    OpportunityStatus.Archived,
  ],
  [OpportunityStatus.GoConditional]: [
    OpportunityStatus.Go,
    OpportunityStatus.NoGo,
    OpportunityStatus.Promoted,
    OpportunityStatus.Dismissed,
    OpportunityStatus.Archived,
  ],
  // Une nouvelle décision GO/GO_CONDITIONAL reste toujours possible depuis NO_GO (mission —
  // confirmé : jamais une dérogation, mais une NOUVELLE décision débloque normalement la suite).
  [OpportunityStatus.NoGo]: [OpportunityStatus.Go, OpportunityStatus.GoConditional, OpportunityStatus.Dismissed, OpportunityStatus.Archived],
  [OpportunityStatus.Promoted]: [],
  [OpportunityStatus.Dismissed]: [OpportunityStatus.Archived],
  [OpportunityStatus.Archived]: [OpportunityStatus.Draft],
};

export function isOpportunityStatus(value: string): value is OpportunityStatus {
  return Object.values(OpportunityStatus).includes(value as OpportunityStatus);
}

export function parseOpportunityStatus(value: string): OpportunityStatus {
  if (!isOpportunityStatus(value)) {
    throw new InvalidOpportunityStatusError(value);
  }
  return value;
}
