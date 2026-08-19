import { describe, expect, it } from "vitest";
import { createClientPortfolioTestFixture } from "../../../tenders/test-support/fakes";
import { Opportunity } from "../../domain/opportunity.aggregate";
import { OpportunityId } from "../../domain/opportunity-id.value-object";
import { OpportunityQuickScoreNotFoundError } from "../../domain/errors";
import { InMemoryOpportunityQuickScoreRepository, InMemoryOpportunityRepository } from "../../test-support/fakes";
import type { CreateOpportunityQuickScoreInput } from "../ports/opportunity-quick-score.repository";
import { GetOpportunityQuickScoreUseCase } from "./get-opportunity-quick-score.use-case";

const ORG = "org-1";

function baseInput(overrides: Partial<CreateOpportunityQuickScoreInput> = {}): CreateOpportunityQuickScoreInput {
  return {
    id: "score-1",
    organizationId: ORG,
    opportunityId: "opportunity-1",
    calculationVersion: "1.0.0",
    requestedByUserId: "user-1",
    dataSnapshot: { companyProfile: null, candidateCompanyId: null },
    createdAt: new Date("2026-01-01T00:00:00Z"),
    result: {
      globalScore: 50,
      confidence: 0.5,
      complexity: 3,
      categoryScores: {} as never,
      strengths: [],
      weaknesses: [],
      blockers: [],
      missingData: [],
    },
    ...overrides,
  };
}

async function buildHarness(opportunityOverrides: Partial<Parameters<typeof Opportunity.create>[0]> = {}) {
  const opportunityRepository = new InMemoryOpportunityRepository();
  const quickScoreRepository = new InMemoryOpportunityQuickScoreRepository();
  const clientPortfolio = await createClientPortfolioTestFixture(ORG);
  const useCase = new GetOpportunityQuickScoreUseCase(opportunityRepository, quickScoreRepository, clientPortfolio.assertClientAccessUseCase);

  const opportunity = Opportunity.create({
    id: OpportunityId.from("opportunity-1"),
    organizationId: ORG,
    title: "Marché de nettoyage",
    createdBy: "user-1",
    occurredAt: new Date("2026-01-01T00:00:00Z"),
    ...opportunityOverrides,
  });
  await opportunityRepository.seed(opportunity);

  return { opportunityRepository, quickScoreRepository, useCase };
}

/** Checkpoint 2.1-A6.2 (correctif audit — P2 F-A6.2-01 "fraîcheur candidate") — cette use case
 *  n'avait aucun test avant ce correctif. */
describe("GetOpportunityQuickScoreUseCase", () => {
  it("throws OpportunityQuickScoreNotFoundError when no score exists yet", async () => {
    const { useCase } = await buildHarness();

    await expect(useCase.execute({ organizationId: ORG, opportunityId: "opportunity-1", actorId: "user-1", actorRole: "BID_MANAGER" })).rejects.toThrow(OpportunityQuickScoreNotFoundError);
  });

  it("candidateStale=false when the score's snapshot candidate matches the Opportunity's current candidateCompanyId", async () => {
    const { quickScoreRepository, useCase } = await buildHarness({ candidateCompanyId: "candidate-alpha" });
    await quickScoreRepository.create(baseInput({ dataSnapshot: { companyProfile: null, candidateCompanyId: "candidate-alpha" } }));

    const result = await useCase.execute({ organizationId: ORG, opportunityId: "opportunity-1", actorId: "user-1", actorRole: "BID_MANAGER" });

    expect(result.candidateStale).toBe(false);
  });

  it("BLOQUANT (F-A6.2-01) — candidateStale=true after the Opportunity's candidate changed from Alpha to Beta since this score was computed", async () => {
    const { quickScoreRepository, useCase } = await buildHarness({ candidateCompanyId: "candidate-beta" });
    await quickScoreRepository.create(baseInput({ dataSnapshot: { companyProfile: null, candidateCompanyId: "candidate-alpha" } }));

    const result = await useCase.execute({ organizationId: ORG, opportunityId: "opportunity-1", actorId: "user-1", actorRole: "BID_MANAGER" });

    expect(result.candidateStale).toBe(true);
  });

  it("candidateStale=true when a candidate is now resolved but the score was computed before any candidate was selected (LEGACY FLOW snapshot)", async () => {
    const { quickScoreRepository, useCase } = await buildHarness({ candidateCompanyId: "candidate-alpha" });
    await quickScoreRepository.create(baseInput({ dataSnapshot: { companyProfile: null, candidateCompanyId: null } }));

    const result = await useCase.execute({ organizationId: ORG, opportunityId: "opportunity-1", actorId: "user-1", actorRole: "BID_MANAGER" });

    expect(result.candidateStale).toBe(true);
  });

  it("candidateStale=false when neither the snapshot nor the Opportunity has ever had a candidate (legacy, unchanged)", async () => {
    const { quickScoreRepository, useCase } = await buildHarness();
    await quickScoreRepository.create(baseInput({ dataSnapshot: { companyProfile: null, candidateCompanyId: null } }));

    const result = await useCase.execute({ organizationId: ORG, opportunityId: "opportunity-1", actorId: "user-1", actorRole: "BID_MANAGER" });

    expect(result.candidateStale).toBe(false);
  });
});
