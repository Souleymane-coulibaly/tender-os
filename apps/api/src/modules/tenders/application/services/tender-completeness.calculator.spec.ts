import { describe, expect, it } from "vitest";
import { AwardCriterion } from "../../domain/award-criterion.entity";
import { Milestone } from "../../domain/milestone.entity";
import { TenderLot } from "../../domain/tender-lot.entity";
import { Tender } from "../../domain/tender.aggregate";
import { TenderId } from "../../domain/tender-id.value-object";
import { computeTenderCompleteness, TenderCompletenessStatus } from "./tender-completeness.calculator";

const NOW = new Date("2026-07-26T14:00:00Z");

function createTender(overrides: Partial<Parameters<typeof Tender.create>[0]> = {}): Tender {
  return Tender.create({
    id: TenderId.from("tender-1"),
    organizationId: "org-1",
    clientAccountId: "client-1",
    title: "Marché de fournitures",
    createdBy: "user-1",
    occurredAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  });
}

function createLot(): TenderLot {
  return TenderLot.create({
    id: "lot-1",
    organizationId: "org-1",
    tenderId: "tender-1",
    lotNumber: "01",
    title: "Lot travaux",
    displayOrder: 0,
    occurredAt: NOW,
  });
}

function createCriterion(weight: string, id = "criterion-1"): AwardCriterion {
  return AwardCriterion.create({ id, organizationId: "org-1", tenderId: "tender-1", name: "Prix", weight, occurredAt: NOW });
}

function createMilestone(overrides: { date: Date; mandatory?: boolean }): Milestone {
  return Milestone.create({
    id: "milestone-1",
    organizationId: "org-1",
    tenderId: "tender-1",
    title: "Remise des offres",
    date: overrides.date,
    type: "SUBMISSION_DEADLINE",
    mandatory: overrides.mandatory,
    occurredAt: NOW,
  });
}

const baseInput = {
  candidateArchived: false,
  lots: [],
  criteria: [],
  requestedDocumentsCount: 0,
  milestones: [],
  risksCount: 0,
  now: NOW,
};

describe("computeTenderCompleteness — generalInformation", () => {
  it("is MISSING when no general field is filled", () => {
    const result = computeTenderCompleteness({ ...baseInput, tender: createTender() });
    expect(result.generalInformation).toBe(TenderCompletenessStatus.Missing);
  });

  it("is PARTIAL when only some general fields are filled", () => {
    const tender = createTender({ description: "Fourniture de matériel informatique" });
    const result = computeTenderCompleteness({ ...baseInput, tender });
    expect(result.generalInformation).toBe(TenderCompletenessStatus.Partial);
  });

  it("is COMPLETE when description/procedureType/estimatedAmount/submissionDeadline are all filled", () => {
    const tender = createTender({
      description: "Fourniture de matériel informatique",
      procedureType: "Appel d'offres ouvert",
      estimatedAmount: "100000",
      submissionDeadline: new Date("2026-09-01T00:00:00Z"),
    });
    const result = computeTenderCompleteness({ ...baseInput, tender });
    expect(result.generalInformation).toBe(TenderCompletenessStatus.Complete);
  });
});

describe("computeTenderCompleteness — candidate", () => {
  it("is INCONSISTENT when the candidate client account is archived", () => {
    const result = computeTenderCompleteness({ ...baseInput, tender: createTender(), candidateArchived: true });
    expect(result.candidate).toBe(TenderCompletenessStatus.Inconsistent);
  });

  it("is COMPLETE otherwise (mandatory field, always present)", () => {
    const result = computeTenderCompleteness({ ...baseInput, tender: createTender() });
    expect(result.candidate).toBe(TenderCompletenessStatus.Complete);
  });
});

describe("computeTenderCompleteness — buyer", () => {
  it("is MISSING when neither buyerId nor buyerName is set", () => {
    const result = computeTenderCompleteness({ ...baseInput, tender: createTender() });
    expect(result.buyer).toBe(TenderCompletenessStatus.Missing);
  });

  it("is PARTIAL when only buyerName (V1 free text) is set", () => {
    const result = computeTenderCompleteness({ ...baseInput, tender: createTender({ buyerName: "Mairie de Test" }) });
    expect(result.buyer).toBe(TenderCompletenessStatus.Partial);
  });

  it("is COMPLETE when buyerId (resolved Buyer entity) is set", () => {
    const result = computeTenderCompleteness({ ...baseInput, tender: createTender({ buyerId: "buyer-1" }) });
    expect(result.buyer).toBe(TenderCompletenessStatus.Complete);
  });
});

describe("computeTenderCompleteness — dates", () => {
  it("is MISSING when there is no submission deadline", () => {
    const result = computeTenderCompleteness({ ...baseInput, tender: createTender() });
    expect(result.dates).toBe(TenderCompletenessStatus.Missing);
  });

  it("is TO_VERIFY when the deadline is already in the past", () => {
    const tender = createTender({ submissionDeadline: new Date("2020-01-01T00:00:00Z") });
    const result = computeTenderCompleteness({ ...baseInput, tender });
    expect(result.dates).toBe(TenderCompletenessStatus.ToVerify);
  });

  it("is COMPLETE when the deadline is in the future", () => {
    const tender = createTender({ submissionDeadline: new Date("2027-01-01T00:00:00Z") });
    const result = computeTenderCompleteness({ ...baseInput, tender });
    expect(result.dates).toBe(TenderCompletenessStatus.Complete);
  });
});

describe("computeTenderCompleteness — lots / requestedDocuments / risks", () => {
  it("are MISSING when the corresponding list is empty", () => {
    const result = computeTenderCompleteness({ ...baseInput, tender: createTender() });
    expect(result.lots).toBe(TenderCompletenessStatus.Missing);
    expect(result.requestedDocuments).toBe(TenderCompletenessStatus.Missing);
    expect(result.risks).toBe(TenderCompletenessStatus.Missing);
  });

  it("are COMPLETE as soon as at least one item exists", () => {
    const result = computeTenderCompleteness({
      ...baseInput,
      tender: createTender(),
      lots: [createLot()],
      requestedDocumentsCount: 1,
      risksCount: 1,
    });
    expect(result.lots).toBe(TenderCompletenessStatus.Complete);
    expect(result.requestedDocuments).toBe(TenderCompletenessStatus.Complete);
    expect(result.risks).toBe(TenderCompletenessStatus.Complete);
  });
});

describe("computeTenderCompleteness — criteria", () => {
  it("is MISSING with no active top-level criteria", () => {
    const result = computeTenderCompleteness({ ...baseInput, tender: createTender() });
    expect(result.criteria).toBe(TenderCompletenessStatus.Missing);
  });

  it("is COMPLETE with a single criterion regardless of its weight (unweighted criteria supported)", () => {
    const result = computeTenderCompleteness({ ...baseInput, tender: createTender(), criteria: [createCriterion("0")] });
    expect(result.criteria).toBe(TenderCompletenessStatus.Complete);
  });

  it("is COMPLETE when several criteria sum to 100 within tolerance", () => {
    const criteria = [createCriterion("60", "c1"), createCriterion("40", "c2")];
    const result = computeTenderCompleteness({ ...baseInput, tender: createTender(), criteria });
    expect(result.criteria).toBe(TenderCompletenessStatus.Complete);
  });

  it("is INCONSISTENT when several criteria do not sum to 100 (mission §9 — signaler, jamais bloquer)", () => {
    const criteria = [createCriterion("60", "c1"), createCriterion("30", "c2")];
    const result = computeTenderCompleteness({ ...baseInput, tender: createTender(), criteria });
    expect(result.criteria).toBe(TenderCompletenessStatus.Inconsistent);
  });
});

describe("computeTenderCompleteness — milestones", () => {
  it("is MISSING when there are no milestones", () => {
    const result = computeTenderCompleteness({ ...baseInput, tender: createTender() });
    expect(result.milestones).toBe(TenderCompletenessStatus.Missing);
  });

  it("is TO_VERIFY when a mandatory milestone is overdue and not done", () => {
    const milestones = [createMilestone({ date: new Date("2020-01-01T00:00:00Z"), mandatory: true })];
    const result = computeTenderCompleteness({ ...baseInput, tender: createTender(), milestones });
    expect(result.milestones).toBe(TenderCompletenessStatus.ToVerify);
  });

  it("is COMPLETE when an overdue milestone is only informative (not mandatory)", () => {
    const milestones = [createMilestone({ date: new Date("2020-01-01T00:00:00Z"), mandatory: false })];
    const result = computeTenderCompleteness({ ...baseInput, tender: createTender(), milestones });
    expect(result.milestones).toBe(TenderCompletenessStatus.Complete);
  });

  it("is COMPLETE when all milestones are in the future", () => {
    const milestones = [createMilestone({ date: new Date("2027-01-01T00:00:00Z"), mandatory: true })];
    const result = computeTenderCompleteness({ ...baseInput, tender: createTender(), milestones });
    expect(result.milestones).toBe(TenderCompletenessStatus.Complete);
  });
});
