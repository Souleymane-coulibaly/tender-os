import type { QuickScoreResult } from "../../domain/scoring/compute-opportunity-quick-score";

export type OpportunityQuickScoreRecord = Readonly<{
  id: string;
  organizationId: string;
  opportunityId: string;
  scoreVersion: number;
  calculationVersion: string;
  requestedByUserId?: string | undefined;
  dataSnapshot: unknown;
  createdAt: string;
  /** Checkpoint 2.1-A6.2 — calculé À LA LECTURE uniquement (jamais persisté comme colonne, dérivé de
   *  `dataSnapshot.candidateCompanyId`, voir `withQuickScoreCandidateStaleness`). Même discipline que
   *  `GoNoGoReportRecord.candidateStale`. */
  candidateStale?: boolean | undefined;
}> &
  QuickScoreResult;

export type CreateOpportunityQuickScoreInput = Readonly<{
  id: string;
  organizationId: string;
  opportunityId: string;
  calculationVersion: string;
  requestedByUserId?: string | undefined;
  dataSnapshot: unknown;
  createdAt: Date;
  result: QuickScoreResult;
}>;

export interface OpportunityQuickScoreRepository {
  create(input: CreateOpportunityQuickScoreInput): Promise<OpportunityQuickScoreRecord>;
  /** Version la plus élevée déjà attribuée pour cette Opportunity — `0` si aucune n'existe encore
   *  (la prochaine sera `1`). Même motif que `resolveLatestAnalysisVersion` (module `analysis`). */
  getLatestVersion(input: { organizationId: string; opportunityId: string }): Promise<number>;
  getLatest(input: { organizationId: string; opportunityId: string }): Promise<OpportunityQuickScoreRecord | null>;
  listVersions(input: { organizationId: string; opportunityId: string }): Promise<OpportunityQuickScoreRecord[]>;
}

export const OPPORTUNITY_QUICK_SCORE_REPOSITORY = Symbol("OPPORTUNITY_QUICK_SCORE_REPOSITORY");

/** Checkpoint 2.1-A6.2 (correctif audit — P2 "fraîcheur candidate") — `dataSnapshot` reste
 *  volontairement `unknown` au niveau du port (pas de schéma JSON formel dans ce dépôt), donc
 *  `candidateCompanyId` en est extrait ici défensivement, jamais supposé présent (rapports générés
 *  avant ce correctif n'en portent aucun — `undefined`, jamais une valeur fabriquée). */
function extractSnapshotCandidateCompanyId(dataSnapshot: unknown): string | undefined {
  if (typeof dataSnapshot !== "object" || dataSnapshot === null) return undefined;
  const value = (dataSnapshot as Record<string, unknown>).candidateCompanyId;
  return typeof value === "string" ? value : undefined;
}

/** Seul point de calcul de `candidateStale` pour le Niveau 1 — jamais dupliqué entre
 *  `GetOpportunityQuickScoreUseCase`/`ListOpportunityQuickScoresUseCase`. Même sémantique que
 *  `withGoNoGoCandidateStaleness` (Niveau 2) : un score sans candidate connue (LEGACY FLOW) sur une
 *  Opportunity qui EN a désormais une est également `stale`. */
export function withQuickScoreCandidateStaleness(record: OpportunityQuickScoreRecord, currentCandidateCompanyId: string | undefined): OpportunityQuickScoreRecord {
  return { ...record, candidateStale: extractSnapshotCandidateCompanyId(record.dataSnapshot) !== currentCandidateCompanyId };
}
