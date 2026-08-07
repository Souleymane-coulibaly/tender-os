import { describe, expect, it } from "vitest";
import type { CompanyProfileSummary, GetCompanyProfileUseCase } from "../../../company-profile";
import { createClientPortfolioTestFixture, DEFAULT_TEST_CLIENT_ACCOUNT_ID } from "../../../tenders/test-support/fakes";
import { OpportunityPermissionMissingError } from "../../domain/errors";
import { Opportunity } from "../../domain/opportunity.aggregate";
import { OpportunityId } from "../../domain/opportunity-id.value-object";
import { FakeOutboxWriter, FixedClock, InMemoryAuditLogWriter, InMemoryOpportunityQuickScoreRepository, InMemoryOpportunityRepository, SequentialIdGenerator } from "../../test-support/fakes";
import { ComputeOpportunityQuickScoreUseCase } from "./compute-opportunity-quick-score.use-case";

const ORG = "org-1";

function emptyCompanyProfileSummary(overrides: Partial<CompanyProfileSummary> = {}): CompanyProfileSummary {
  return {
    clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID,
    legalIdentity: null,
    representatives: [],
    bankAccounts: [],
    insurances: [],
    certifications: [],
    references: [],
    humanResources: [],
    materialResources: [],
    documents: [],
    completeness: { identity: "MISSING", banking: "MISSING", insurances: "MISSING", certifications: "MISSING", references: "MISSING", resources: "MISSING", documents: "MISSING" },
    ...overrides,
  };
}

class FakeGetCompanyProfileUseCase {
  calls: unknown[] = [];
  constructor(private readonly summary: CompanyProfileSummary) {}
  async execute(input: unknown): Promise<CompanyProfileSummary> {
    this.calls.push(input);
    return this.summary;
  }
}

async function buildHarness(companyProfileSummary: CompanyProfileSummary = emptyCompanyProfileSummary()) {
  const opportunityRepository = new InMemoryOpportunityRepository();
  const quickScoreRepository = new InMemoryOpportunityQuickScoreRepository();
  const auditLogWriter = new InMemoryAuditLogWriter();
  const outboxWriter = new FakeOutboxWriter();
  const clientPortfolio = await createClientPortfolioTestFixture(ORG);
  const fakeGetCompanyProfileUseCase = new FakeGetCompanyProfileUseCase(companyProfileSummary);

  const useCase = new ComputeOpportunityQuickScoreUseCase(
    opportunityRepository,
    quickScoreRepository,
    auditLogWriter,
    new FixedClock(),
    new SequentialIdGenerator(),
    outboxWriter,
    clientPortfolio.assertClientAccessUseCase,
    fakeGetCompanyProfileUseCase as unknown as GetCompanyProfileUseCase,
  );

  return { opportunityRepository, quickScoreRepository, auditLogWriter, outboxWriter, useCase, fakeGetCompanyProfileUseCase };
}

function createOpportunity(overrides: Partial<Parameters<typeof Opportunity.create>[0]> = {}): Opportunity {
  return Opportunity.create({
    id: OpportunityId.from("opportunity-1"),
    organizationId: ORG,
    title: "Marché de nettoyage",
    createdBy: "user-1",
    occurredAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  });
}

describe("ComputeOpportunityQuickScoreUseCase", () => {
  it("computes and persists a new quick score version, without calling company-profile when no clientAccountId is resolved", async () => {
    const { opportunityRepository, quickScoreRepository, useCase, fakeGetCompanyProfileUseCase } = await buildHarness();
    const opportunity = createOpportunity();
    await opportunityRepository.seed(opportunity);

    const record = await useCase.execute({ organizationId: ORG, opportunityId: opportunity.id.value, actorId: "user-1", actorRole: "BID_MANAGER" });

    expect(record.scoreVersion).toBe(1);
    expect(fakeGetCompanyProfileUseCase.calls).toHaveLength(0);
    const versions = await quickScoreRepository.listVersions({ organizationId: ORG, opportunityId: opportunity.id.value });
    expect(versions).toHaveLength(1);
  });

  it("calls GetCompanyProfileUseCase and factors its data into the score when clientAccountId is resolved", async () => {
    const { opportunityRepository, useCase, fakeGetCompanyProfileUseCase } = await buildHarness(
      emptyCompanyProfileSummary({ completeness: { identity: "COMPLETE", banking: "MISSING", insurances: "MISSING", certifications: "MISSING", references: "MISSING", resources: "MISSING", documents: "MISSING" } }),
    );
    const opportunity = createOpportunity({ clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID });
    await opportunityRepository.seed(opportunity);

    const record = await useCase.execute({ organizationId: ORG, opportunityId: opportunity.id.value, actorId: "user-1", actorRole: "BID_MANAGER" });

    expect(fakeGetCompanyProfileUseCase.calls).toHaveLength(1);
    expect(record.categoryScores.administratif.score).toBe(100);
  });

  it("creates a new version on each call, never overwriting the previous one (append-only)", async () => {
    const { opportunityRepository, quickScoreRepository, useCase } = await buildHarness();
    const opportunity = createOpportunity();
    await opportunityRepository.seed(opportunity);

    await useCase.execute({ organizationId: ORG, opportunityId: opportunity.id.value, actorId: "user-1", actorRole: "BID_MANAGER" });
    const second = await useCase.execute({ organizationId: ORG, opportunityId: opportunity.id.value, actorId: "user-1", actorRole: "BID_MANAGER" });

    expect(second.scoreVersion).toBe(2);
    const versions = await quickScoreRepository.listVersions({ organizationId: ORG, opportunityId: opportunity.id.value });
    expect(versions).toHaveLength(2);
  });

  it("refuses when the actor lacks opportunity:compute_quick_score", async () => {
    const { opportunityRepository, useCase } = await buildHarness();
    const opportunity = createOpportunity();
    await opportunityRepository.seed(opportunity);

    await expect(useCase.execute({ organizationId: ORG, opportunityId: opportunity.id.value, actorId: "user-1", actorRole: "READ_ONLY" })).rejects.toThrow(OpportunityPermissionMissingError);
  });

  it("records an audit entry and an OpportunityQuickScoreComputed outbox event", async () => {
    const { opportunityRepository, auditLogWriter, outboxWriter, useCase } = await buildHarness();
    const opportunity = createOpportunity();
    await opportunityRepository.seed(opportunity);

    await useCase.execute({ organizationId: ORG, opportunityId: opportunity.id.value, actorId: "user-1", actorRole: "BID_MANAGER" });

    expect(auditLogWriter.entries).toHaveLength(1);
    expect(auditLogWriter.entries[0]?.action).toBe("opportunity.quick_score_computed");
    expect(outboxWriter.writes).toHaveLength(1);
    expect(outboxWriter.writes[0]?.events[0]?.eventType).toBe("OpportunityQuickScoreComputed");
  });
});
