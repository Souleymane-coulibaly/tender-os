import type { Tender } from "../../domain/tender.aggregate";
import type { AwardCriterion } from "../../domain/award-criterion.entity";
import type { Milestone } from "../../domain/milestone.entity";
import type { TenderLot } from "../../domain/tender-lot.entity";

/** Mission §15 — indicateur déterministe et explicable, PAR CATÉGORIE, jamais un score global ni
 *  un GO/NO-GO, jamais d'IA. Ne bloque jamais la création ou la sauvegarde (purement informatif). */
export const TenderCompletenessStatus = {
  Complete: "COMPLETE",
  Partial: "PARTIAL",
  Missing: "MISSING",
  Inconsistent: "INCONSISTENT",
  ToVerify: "TO_VERIFY",
} as const;
export type TenderCompletenessStatus = (typeof TenderCompletenessStatus)[keyof typeof TenderCompletenessStatus];

export type TenderCompleteness = Readonly<{
  generalInformation: TenderCompletenessStatus;
  candidate: TenderCompletenessStatus;
  buyer: TenderCompletenessStatus;
  dates: TenderCompletenessStatus;
  lots: TenderCompletenessStatus;
  criteria: TenderCompletenessStatus;
  requestedDocuments: TenderCompletenessStatus;
  milestones: TenderCompletenessStatus;
  risks: TenderCompletenessStatus;
}>;

const CRITERIA_WEIGHT_TOLERANCE = 0.5;

export function computeTenderCompleteness(input: {
  tender: Tender;
  candidateArchived: boolean;
  lots: readonly TenderLot[];
  criteria: readonly AwardCriterion[];
  requestedDocumentsCount: number;
  milestones: readonly Milestone[];
  risksCount: number;
  now: Date;
}): TenderCompleteness {
  const { tender } = input;

  const generalInformationFields = [tender.description, tender.procedureType, tender.estimatedAmount, tender.submissionDeadline];
  const filledGeneralFields = generalInformationFields.filter((value) => value !== undefined && value !== "").length;
  const generalInformation =
    filledGeneralFields === generalInformationFields.length
      ? TenderCompletenessStatus.Complete
      : filledGeneralFields === 0
        ? TenderCompletenessStatus.Missing
        : TenderCompletenessStatus.Partial;

  const candidate = input.candidateArchived ? TenderCompletenessStatus.Inconsistent : TenderCompletenessStatus.Complete;

  const buyer = tender.buyerId ? TenderCompletenessStatus.Complete : tender.buyerName ? TenderCompletenessStatus.Partial : TenderCompletenessStatus.Missing;

  const dates = !tender.submissionDeadline
    ? TenderCompletenessStatus.Missing
    : tender.submissionDeadline.getTime() < input.now.getTime()
      ? TenderCompletenessStatus.ToVerify
      : TenderCompletenessStatus.Complete;

  const lots = input.lots.length === 0 ? TenderCompletenessStatus.Missing : TenderCompletenessStatus.Complete;

  const criteria = computeCriteriaCompleteness(input.criteria);

  const requestedDocuments = input.requestedDocumentsCount === 0 ? TenderCompletenessStatus.Missing : TenderCompletenessStatus.Complete;

  const milestones = computeMilestonesCompleteness(input.milestones, input.now);

  const risks = input.risksCount === 0 ? TenderCompletenessStatus.Missing : TenderCompletenessStatus.Complete;

  return { generalInformation, candidate, buyer, dates, lots, criteria, requestedDocuments, milestones, risks };
}

function computeCriteriaCompleteness(criteria: readonly AwardCriterion[]): TenderCompletenessStatus {
  const topLevelActive = criteria.filter((criterion) => criterion.status === "ACTIVE" && !criterion.parentCriterionId);
  if (topLevelActive.length === 0) {
    return TenderCompletenessStatus.Missing;
  }
  if (topLevelActive.length === 1) {
    return TenderCompletenessStatus.Complete;
  }
  const totalWeight = topLevelActive.reduce((sum, criterion) => sum + Number(criterion.weight), 0);
  return Math.abs(totalWeight - 100) <= CRITERIA_WEIGHT_TOLERANCE ? TenderCompletenessStatus.Complete : TenderCompletenessStatus.Inconsistent;
}

function computeMilestonesCompleteness(milestones: readonly Milestone[], now: Date): TenderCompletenessStatus {
  if (milestones.length === 0) {
    return TenderCompletenessStatus.Missing;
  }
  const hasOverdueMandatory = milestones.some((milestone) => milestone.mandatory && milestone.isOverdue(now));
  return hasOverdueMandatory ? TenderCompletenessStatus.ToVerify : TenderCompletenessStatus.Complete;
}
