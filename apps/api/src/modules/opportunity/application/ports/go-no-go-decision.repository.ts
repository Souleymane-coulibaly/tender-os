import type { GoNoGoDecisionLevel, GoNoGoDecisionValue } from "../../domain/go-no-go-decision";

export type GoNoGoDecisionRecord = Readonly<{
  id: string;
  organizationId: string;
  level: GoNoGoDecisionLevel;
  opportunityId?: string | undefined;
  tenderId?: string | undefined;
  linkedQuickScoreId?: string | undefined;
  linkedReportId?: string | undefined;
  decision: GoNoGoDecisionValue;
  justification?: string | undefined;
  conditions?: string | undefined;
  comment?: string | undefined;
  actorId: string;
  decidedAt: string;
}>;

export type CreateGoNoGoDecisionInput = Readonly<{
  id: string;
  organizationId: string;
  level: GoNoGoDecisionLevel;
  opportunityId?: string | undefined;
  tenderId?: string | undefined;
  linkedQuickScoreId?: string | undefined;
  linkedReportId?: string | undefined;
  decision: GoNoGoDecisionValue;
  justification?: string | undefined;
  conditions?: string | undefined;
  comment?: string | undefined;
  actorId: string;
  decidedAt: Date;
}>;

export interface GoNoGoDecisionRepository {
  create(input: CreateGoNoGoDecisionInput): Promise<GoNoGoDecisionRecord>;
  /** La plus récente d'abord (ordre `insertSeq DESC`, jamais ambigu même en cas de collision
   *  d'horloge — voir le commentaire du modèle Prisma `GoNoGoDecision.insertSeq`). */
  listByOpportunity(input: { organizationId: string; opportunityId: string }): Promise<GoNoGoDecisionRecord[]>;
  listByTender(input: { organizationId: string; tenderId: string }): Promise<GoNoGoDecisionRecord[]>;
  getLatestByOpportunity(input: { organizationId: string; opportunityId: string }): Promise<GoNoGoDecisionRecord | null>;
  getLatestByTender(input: { organizationId: string; tenderId: string }): Promise<GoNoGoDecisionRecord | null>;
}

export const GO_NO_GO_DECISION_REPOSITORY = Symbol("GO_NO_GO_DECISION_REPOSITORY");
