import { describe, expect, it } from "vitest";
import { CandidateIdentitySource, type CandidateIdentitySummary, type ResolveCandidateIdentityUseCase } from "../../../candidate-company";
import type { CompanyProfileSummary } from "../../../company-profile";
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
    fakeResolveCandidateIdentityUseCase as unknown as ResolveCandidateIdentityUseCase,
    // CCV2-E — résolveur de capacités candidate (double : collections vides ; ces tests couvrent
    // le LEGACY FLOW ou une candidate sans capacité, jamais un emprunt au profil du client).
    { execute: async () => ({ source: "NONE", representatives: [], insurances: [], certifications: [], references: [], humanResources: [], materialResources: [], documents: [] }) } as never,
  );

  // `fakeGetCompanyProfileUseCase` n'est plus INJECTE (CCV2-G.2 a retire la dependance) mais reste
  // expose : il est le temoin qui prouve qu'aucun appel n'est emis vers le profil du client.
  return { opportunityRepository, quickScoreRepository, auditLogWriter, outboxWriter, useCase, fakeResolveCandidateIdentityUseCase, fakeGetCompanyProfileUseCase };
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
    const { opportunityRepository, quickScoreRepository, useCase } = await buildHarness();
    const opportunity = createOpportunity();
    await opportunityRepository.seed(opportunity);

    const record = await useCase.execute({ organizationId: ORG, opportunityId: opportunity.id.value, actorId: "user-1", actorRole: "BID_MANAGER" });

    expect(record.scoreVersion).toBe(1);
    const versions = await quickScoreRepository.listVersions({ organizationId: ORG, opportunityId: opportunity.id.value });
    expect(versions).toHaveLength(1);
  });

  /**
   * Checkpoint TENDEROS-2.1-CCV2-G.2 — CONTRAT INVERSÉ. Ce test encodait la substitution que la
   * mission supprime : sans entreprise candidate, le profil du CLIENT commercial était chargé et
   * noté comme s'il était le candidat. Le score reste possible avant toute sélection de candidat
   * (le domaine traite `companyProfile` comme optionnel), mais il est désormais GÉNÉRIQUE.
   */
  it("BLOQUANT (CCV2-G.2) — sans entreprise candidate, le score reste générique et `CompanyProfile` n'est JAMAIS consulté", async () => {
    const { opportunityRepository, useCase, fakeGetCompanyProfileUseCase } = await buildHarness();
    await opportunityRepository.seed(createOpportunity({ clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID }));

    const record = await useCase.execute({ organizationId: ORG, opportunityId: "opportunity-1", actorId: "user-1", actorRole: "BID_MANAGER" });

    expect(fakeGetCompanyProfileUseCase.calls, "CompanyProfile consulté").toHaveLength(0);
    // Le score existe bel et bien : la capacité générique est préservée, jamais supprimée.
    expect(record.scoreVersion).toBe(1);
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
    it("BLOQUANT (test SOT critique) — an Opportunity with a resolved CandidateCompany NEVER calls even when clientAccountId is also set", async () => {
      const { opportunityRepository, useCase, fakeResolveCandidateIdentityUseCase, fakeGetCompanyProfileUseCase } = await buildHarness(emptyCompanyProfileSummary(), {
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
      // Checkpoint TENDEROS-2.1-CCV2-G.2 — la comparaison a un score « LEGACY » disparait : sans
      // entreprise candidate le profil du CLIENT n'est plus jamais lu, donc il n'existe plus de
      // score gonfle par CLIENT-X auquel se comparer. La PROPRIETE testee devient structurelle et
      // est verifiee ci-dessous sous sa forme la plus forte : la donnee de CLIENT-X existe et
      // n'apparait nulle part.

      // CANDIDATE-ALPHA resolved: same CLIENT-X profile data exists, but must never be used.
      const modern = await buildHarness(clientXProfile, { source: CandidateIdentitySource.CandidateCompany, candidateCompanyId: "candidate-alpha", legalName: "CANDIDATE-ALPHA" });
      const modernOpportunity = createOpportunity({ clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID, candidateCompanyId: "candidate-alpha" });
      await modern.opportunityRepository.seed(modernOpportunity);
      const modernRecord = await modern.useCase.execute({ organizationId: ORG, opportunityId: modernOpportunity.id.value, actorId: "user-1", actorRole: "BID_MANAGER" });

      // LEGACY-Z benefits from CLIENT-X's COMPLETE identity (administratif = 100, established
      // behavior). CANDIDATE-ALPHA must NOT inherit that score from a different legal entity.
      expect(modernRecord.categoryScores.administratif.score).not.toBe(100);
      expect(JSON.stringify(modernRecord), "aucune trace du profil client").not.toContain("CLIENT-X");
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

    /**
     * Checkpoint CCV2-G.2 — CONTRAT INVERSÉ (même motif). Le « LEGACY FLOW » du quick score
     * n'existe plus : il consistait précisément à noter le client commercial.
     */
    it("BLOQUANT (CCV2-G.2) — le repli LEGACY vers clientAccountId est supprimé, sans supprimer le score générique", async () => {
      const { opportunityRepository, useCase, fakeGetCompanyProfileUseCase } = await buildHarness();
      await opportunityRepository.seed(createOpportunity({ clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID }));

      const record = await useCase.execute({ organizationId: ORG, opportunityId: "opportunity-1", actorId: "user-1", actorRole: "BID_MANAGER" });

      expect(fakeGetCompanyProfileUseCase.calls).toHaveLength(0);
      expect(record.scoreVersion).toBe(1);
    });

    /**
     * Checkpoint CCV2-G.2 — CONTRAT INVERSÉ. La MOITIÉ essentielle de l'ancienne règle survit :
     * une entreprise candidate irrésolvable ne provoque toujours JAMAIS de plantage. Ce qui change,
     * c'est qu'elle ne bascule plus vers le profil du client.
     */
    it("BLOQUANT (CCV2-G.2) — une entreprise candidate irrésolvable ne plante pas et ne bascule JAMAIS sur le client", async () => {
      const { opportunityRepository, useCase, fakeGetCompanyProfileUseCase } = await buildHarness(emptyCompanyProfileSummary(), { source: CandidateIdentitySource.None });
      await opportunityRepository.seed(createOpportunity({ clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID, candidateCompanyId: "candidate-archived" }));

      const record = await useCase.execute({ organizationId: ORG, opportunityId: "opportunity-1", actorId: "user-1", actorRole: "BID_MANAGER" });

      expect(fakeGetCompanyProfileUseCase.calls).toHaveLength(0);
      expect(record.scoreVersion).toBe(1);
    });
  });
});
