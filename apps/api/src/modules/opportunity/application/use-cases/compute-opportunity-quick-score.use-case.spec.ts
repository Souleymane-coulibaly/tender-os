import { describe, expect, it } from "vitest";
import { CandidateIdentitySource, type CandidateIdentitySummary, type ResolveCandidateIdentityUseCase } from "../../../candidate-company";
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

class FakeResolveCandidateIdentityUseCase {
  calls: unknown[] = [];
  constructor(private readonly result: CandidateIdentitySummary) {}
  async execute(input: unknown): Promise<CandidateIdentitySummary> {
    this.calls.push(input);
    return this.result;
  }
}

async function buildHarness(
  companyProfileSummary: CompanyProfileSummary = emptyCompanyProfileSummary(),
  candidateIdentity: CandidateIdentitySummary = { source: CandidateIdentitySource.None },
) {
  const opportunityRepository = new InMemoryOpportunityRepository();
  const quickScoreRepository = new InMemoryOpportunityQuickScoreRepository();
  const auditLogWriter = new InMemoryAuditLogWriter();
  const outboxWriter = new FakeOutboxWriter();
  const clientPortfolio = await createClientPortfolioTestFixture(ORG);
  const fakeGetCompanyProfileUseCase = new FakeGetCompanyProfileUseCase(companyProfileSummary);
  const fakeResolveCandidateIdentityUseCase = new FakeResolveCandidateIdentityUseCase(candidateIdentity);

  const useCase = new ComputeOpportunityQuickScoreUseCase(
    opportunityRepository,
    quickScoreRepository,
    auditLogWriter,
    new FixedClock(),
    new SequentialIdGenerator(),
    outboxWriter,
    clientPortfolio.assertClientAccessUseCase,
    fakeGetCompanyProfileUseCase as unknown as GetCompanyProfileUseCase,
    fakeResolveCandidateIdentityUseCase as unknown as ResolveCandidateIdentityUseCase,
  );

  return { opportunityRepository, quickScoreRepository, auditLogWriter, outboxWriter, useCase, fakeGetCompanyProfileUseCase, fakeResolveCandidateIdentityUseCase };
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

  describe("Candidate SOT (Checkpoint 2.1-A6.2)", () => {
    it("BLOQUANT (test SOT critique) — an Opportunity with a resolved CandidateCompany NEVER calls GetCompanyProfileUseCase, even when clientAccountId is also set", async () => {
      const { opportunityRepository, useCase, fakeGetCompanyProfileUseCase, fakeResolveCandidateIdentityUseCase } = await buildHarness(emptyCompanyProfileSummary(), {
        source: CandidateIdentitySource.CandidateCompany,
        candidateCompanyId: "candidate-alpha",
        legalName: "CANDIDATE-ALPHA",
      });
      const opportunity = createOpportunity({ clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID, candidateCompanyId: "candidate-alpha" });
      await opportunityRepository.seed(opportunity);

      await useCase.execute({ organizationId: ORG, opportunityId: opportunity.id.value, actorId: "user-1", actorRole: "BID_MANAGER" });

      expect(fakeGetCompanyProfileUseCase.calls).toHaveLength(0);
      expect(fakeResolveCandidateIdentityUseCase.calls).toEqual([{ organizationId: ORG, candidateCompanyId: "candidate-alpha" }]);
    });

    it("BLOQUANT (F-A6.2-02, divergence CLIENT-X/CANDIDATE-ALPHA) — the same ClientAccount profile data (CLIENT-X, identity COMPLETE) never inflates the score once a CandidateCompany (CANDIDATE-ALPHA) is resolved for this Opportunity", async () => {
      const clientXProfile = emptyCompanyProfileSummary({
        completeness: { identity: "COMPLETE", banking: "MISSING", insurances: "MISSING", certifications: "MISSING", references: "MISSING", resources: "MISSING", documents: "MISSING" },
      });

      // LEGACY-Z: no candidate at all, company-profile (CLIENT-X) drives the score directly.
      const legacy = await buildHarness(clientXProfile, { source: CandidateIdentitySource.None });
      const legacyOpportunity = createOpportunity({ clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID });
      await legacy.opportunityRepository.seed(legacyOpportunity);
      const legacyRecord = await legacy.useCase.execute({ organizationId: ORG, opportunityId: legacyOpportunity.id.value, actorId: "user-1", actorRole: "BID_MANAGER" });

      // CANDIDATE-ALPHA resolved: same CLIENT-X profile data exists, but must never be used.
      const modern = await buildHarness(clientXProfile, { source: CandidateIdentitySource.CandidateCompany, candidateCompanyId: "candidate-alpha", legalName: "CANDIDATE-ALPHA" });
      const modernOpportunity = createOpportunity({ clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID, candidateCompanyId: "candidate-alpha" });
      await modern.opportunityRepository.seed(modernOpportunity);
      const modernRecord = await modern.useCase.execute({ organizationId: ORG, opportunityId: modernOpportunity.id.value, actorId: "user-1", actorRole: "BID_MANAGER" });

      // LEGACY-Z benefits from CLIENT-X's COMPLETE identity (administratif = 100, established
      // behavior). CANDIDATE-ALPHA must NOT inherit that score from a different legal entity.
      expect(legacyRecord.categoryScores.administratif.score).toBe(100);
      expect(modernRecord.categoryScores.administratif.score).not.toBe(100);
    });

    it("BLOQUANT (F-A6.2-03, multi-candidate isolation) — two Opportunities resolving two different CandidateCompanies never cross-contaminate each other's quick score", async () => {
      const alpha = await buildHarness(emptyCompanyProfileSummary(), {
        source: CandidateIdentitySource.CandidateCompany,
        candidateCompanyId: "candidate-alpha",
        legalName: "CANDIDATE-ALPHA",
      });
      const opportunityAlpha = createOpportunity({ id: OpportunityId.from("opportunity-alpha"), clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID, candidateCompanyId: "candidate-alpha" });
      await alpha.opportunityRepository.seed(opportunityAlpha);

      const beta = await buildHarness(emptyCompanyProfileSummary(), {
        source: CandidateIdentitySource.CandidateCompany,
        candidateCompanyId: "candidate-beta",
        legalName: "CANDIDATE-BETA",
      });
      const opportunityBeta = createOpportunity({ id: OpportunityId.from("opportunity-beta"), clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID, candidateCompanyId: "candidate-beta" });
      await beta.opportunityRepository.seed(opportunityBeta);

      await alpha.useCase.execute({ organizationId: ORG, opportunityId: "opportunity-alpha", actorId: "user-1", actorRole: "BID_MANAGER" });
      await beta.useCase.execute({ organizationId: ORG, opportunityId: "opportunity-beta", actorId: "user-1", actorRole: "BID_MANAGER" });

      expect(alpha.fakeResolveCandidateIdentityUseCase.calls).toEqual([{ organizationId: ORG, candidateCompanyId: "candidate-alpha" }]);
      expect(beta.fakeResolveCandidateIdentityUseCase.calls).toEqual([{ organizationId: ORG, candidateCompanyId: "candidate-beta" }]);
      expect(alpha.fakeGetCompanyProfileUseCase.calls).toHaveLength(0);
      expect(beta.fakeGetCompanyProfileUseCase.calls).toHaveLength(0);

      const alphaVersions = await alpha.quickScoreRepository.listVersions({ organizationId: ORG, opportunityId: "opportunity-alpha" });
      const betaVersions = await beta.quickScoreRepository.listVersions({ organizationId: ORG, opportunityId: "opportunity-beta" });
      expect(alphaVersions).toHaveLength(1);
      expect(betaVersions).toHaveLength(1);
    });

    it("LEGACY FLOW — an Opportunity without candidateCompanyId keeps resolving capacities from clientAccountId exactly as before A6.2", async () => {
      const { opportunityRepository, useCase, fakeGetCompanyProfileUseCase } = await buildHarness();
      const opportunity = createOpportunity({ clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID });
      await opportunityRepository.seed(opportunity);

      await useCase.execute({ organizationId: ORG, opportunityId: opportunity.id.value, actorId: "user-1", actorRole: "BID_MANAGER" });

      expect(fakeGetCompanyProfileUseCase.calls).toHaveLength(1);
    });

    it("a candidateCompanyId that fails to resolve (archived/not found) degrades to source=NONE and falls back to clientAccountId — never a hard crash", async () => {
      const { opportunityRepository, useCase, fakeGetCompanyProfileUseCase } = await buildHarness(emptyCompanyProfileSummary(), { source: CandidateIdentitySource.None });
      const opportunity = createOpportunity({ clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID, candidateCompanyId: "candidate-deleted" });
      await opportunityRepository.seed(opportunity);

      const record = await useCase.execute({ organizationId: ORG, opportunityId: opportunity.id.value, actorId: "user-1", actorRole: "BID_MANAGER" });

      expect(fakeGetCompanyProfileUseCase.calls).toHaveLength(1);
      expect(record.scoreVersion).toBe(1);
    });
  });
});
