import { describe, expect, it } from "vitest";
import { InvalidOpportunityStatusTransitionError, OpportunityArchivedError, OpportunityNotFoundError } from "./errors";
import { assertOpportunityFound, Opportunity } from "./opportunity.aggregate";
import { OpportunityId } from "./opportunity-id.value-object";
import { OpportunityStatus } from "./opportunity-status";

function createOpportunity(overrides: Partial<Parameters<typeof Opportunity.create>[0]> = {}): Opportunity {
  return Opportunity.create({
    id: OpportunityId.from("opportunity-1"),
    organizationId: "org-1",
    title: "Fourniture de mobilier de bureau",
    createdBy: "user-1",
    occurredAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  });
}

describe("Opportunity.create", () => {
  it("starts in DRAFT with version 1 and source MANUAL by default", () => {
    const opportunity = createOpportunity();

    expect(opportunity.status).toBe(OpportunityStatus.Draft);
    expect(opportunity.version).toBe(1);
    expect(opportunity.source).toBe("MANUAL");
    expect(opportunity.tenderId).toBeUndefined();
    expect(opportunity.archivedAt).toBeUndefined();
  });

  it("has no candidateCompanyId by default — a market-watch Opportunity can exist before a candidate is known (Checkpoint 2.1-A3)", () => {
    const opportunity = createOpportunity();
    expect(opportunity.candidateCompanyId).toBeUndefined();
  });

  it("accepts an optional candidateCompanyId at creation, coexisting with clientAccountId", () => {
    const opportunity = createOpportunity({ clientAccountId: "client-1", candidateCompanyId: "candidate-company-1" });
    expect(opportunity.candidateCompanyId).toBe("candidate-company-1");
    expect(opportunity.clientAccountId).toBe("client-1");
  });
});

describe("Opportunity#updateDetails", () => {
  it("applies only the provided fields and bumps version/updatedAt", () => {
    const opportunity = createOpportunity();

    opportunity.updateDetails({ title: "Fourniture de mobilier — révisé" }, new Date("2026-02-01T00:00:00Z"));

    expect(opportunity.title).toBe("Fourniture de mobilier — révisé");
    expect(opportunity.version).toBe(2);
    expect(opportunity.updatedAt).toEqual(new Date("2026-02-01T00:00:00Z"));
  });

  it("sets candidateCompanyId via updateDetails, freely (unlike Tender, no status gate at this stage)", () => {
    const opportunity = createOpportunity();

    opportunity.updateDetails({ candidateCompanyId: "candidate-company-1" }, new Date());

    expect(opportunity.candidateCompanyId).toBe("candidate-company-1");
  });

  it("refuses to update an archived opportunity", () => {
    const opportunity = createOpportunity();
    opportunity.changeStatus(OpportunityStatus.Archived, new Date());

    expect(() => opportunity.updateDetails({ title: "x" }, new Date())).toThrow(OpportunityArchivedError);
  });
});

describe("Opportunity#changeStatus", () => {
  it("follows the upstream funnel DRAFT -> TO_QUALIFY -> QUALIFIED", () => {
    const opportunity = createOpportunity();

    opportunity.changeStatus(OpportunityStatus.ToQualify, new Date());
    opportunity.changeStatus(OpportunityStatus.Qualified, new Date());

    expect(opportunity.status).toBe(OpportunityStatus.Qualified);
  });

  it("refuses to jump straight from DRAFT to GO", () => {
    const opportunity = createOpportunity();

    expect(() => opportunity.changeStatus(OpportunityStatus.Go, new Date())).toThrow(InvalidOpportunityStatusTransitionError);
  });

  it("reaches GO/GO_CONDITIONAL/NO_GO only from QUALIFIED", () => {
    const opportunity = createOpportunity();
    opportunity.changeStatus(OpportunityStatus.ToQualify, new Date());
    opportunity.changeStatus(OpportunityStatus.Qualified, new Date());

    opportunity.changeStatus(OpportunityStatus.Go, new Date());

    expect(opportunity.status).toBe(OpportunityStatus.Go);
  });

  it("allows a new decision from NO_GO back to GO or GO_CONDITIONAL (never a derogation, always a fresh decision)", () => {
    const opportunity = createOpportunity();
    opportunity.changeStatus(OpportunityStatus.ToQualify, new Date());
    opportunity.changeStatus(OpportunityStatus.Qualified, new Date());
    opportunity.changeStatus(OpportunityStatus.NoGo, new Date());

    opportunity.changeStatus(OpportunityStatus.GoConditional, new Date());

    expect(opportunity.status).toBe(OpportunityStatus.GoConditional);
  });

  it("never allows an outgoing transition from PROMOTED (strictly terminal)", () => {
    const opportunity = createOpportunity();
    opportunity.changeStatus(OpportunityStatus.ToQualify, new Date());
    opportunity.changeStatus(OpportunityStatus.Qualified, new Date());
    opportunity.changeStatus(OpportunityStatus.Go, new Date());
    opportunity.changeStatus(OpportunityStatus.Promoted, new Date());

    expect(() => opportunity.changeStatus(OpportunityStatus.Dismissed, new Date())).toThrow(InvalidOpportunityStatusTransitionError);
  });

  it("clears archivedAt when leaving ARCHIVED", () => {
    const opportunity = createOpportunity();
    opportunity.changeStatus(OpportunityStatus.Archived, new Date("2026-01-05T00:00:00Z"));
    expect(opportunity.archivedAt).toEqual(new Date("2026-01-05T00:00:00Z"));

    opportunity.changeStatus(OpportunityStatus.Draft, new Date("2026-01-06T00:00:00Z"));

    expect(opportunity.archivedAt).toBeUndefined();
  });
});

describe("Opportunity#linkPromotedTender", () => {
  it("links the tenderId and bumps version", () => {
    const opportunity = createOpportunity();

    opportunity.linkPromotedTender("tender-1", new Date("2026-03-01T00:00:00Z"));

    expect(opportunity.tenderId).toBe("tender-1");
    expect(opportunity.version).toBe(2);
  });
});

describe("assertOpportunityFound", () => {
  it("returns the opportunity when present", () => {
    const opportunity = createOpportunity();
    expect(assertOpportunityFound(opportunity)).toBe(opportunity);
  });

  it("throws OpportunityNotFoundError when null", () => {
    expect(() => assertOpportunityFound(null)).toThrow(OpportunityNotFoundError);
  });
});
