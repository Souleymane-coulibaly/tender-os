import { beforeEach, describe, expect, it } from "vitest";
import { CompareEstimatedAndActualCostUseCase } from "./compare-estimated-and-actual-cost.use-case";
import { CreatePricingEstimateUseCase } from "./create-pricing-estimate.use-case";
import { ClientAccount } from "../../../client-portfolio/domain/client-account.aggregate";
import { InMemoryClientAccountRepository } from "../../../client-portfolio/test-support/fakes";
import { GetTenderUseCase } from "../../../tenders";
import { Tender } from "../../../tenders/domain/tender.aggregate";
import { TenderId } from "../../../tenders/domain/tender-id.value-object";
import { InMemoryTenderRepository } from "../../../tenders/test-support/fakes";
import {
  buildAssertClientAccessUseCase,
  FakePricingSnapshotReader,
  FakeRoutingModelReader,
  FixedClock,
  InMemoryAuditLogWriter,
  InMemoryGenerationCostReader,
  InMemoryPricingEstimateRepository,
  SequentialIdGenerator,
} from "../../test-support/fakes";
import type { GenerationCostRow } from "../ports/generation-cost-reader";
import type { CurrentModelPricing } from "../ports/pricing-snapshot-reader";
import type { RoutedModel } from "../ports/routing-model-reader";

const ORG = "org-1";
const CLIENT = "client-1";
const TENDER = "tender-1";
const NOW = new Date("2026-08-15T10:00:00.000Z");

const ROUTED_MODEL: RoutedModel = { aiModelId: "model-1", provider: "OPENAI", modelKey: "gpt-4o-mini", policyId: "policy-1", policyVersion: 1 };
const MODEL_PRICING: CurrentModelPricing = {
  aiModelId: "model-1",
  provider: "OPENAI",
  modelKey: "gpt-4o-mini",
  inputPricePerMillionTokens: "10",
  outputPricePerMillionTokens: "10",
  currency: "EUR",
  effectiveFrom: NOW,
};

function row(overrides: Partial<GenerationCostRow>): GenerationCostRow {
  return {
    generationId: "gen-x",
    clientAccountId: CLIENT,
    tenderId: TENDER,
    taskType: "EXECUTIVE_SUMMARY",
    status: "GENERATED",
    createdAt: NOW,
    ...overrides,
  };
}

function buildHarness() {
  const clock = new FixedClock(NOW);
  const idGenerator = new SequentialIdGenerator();
  const auditLogWriter = new InMemoryAuditLogWriter();
  const pricingEstimateRepository = new InMemoryPricingEstimateRepository();
  const generationCostReader = new InMemoryGenerationCostReader();
  const { assertClientAccessUseCase } = buildAssertClientAccessUseCase();
  const clientAccountRepository = new InMemoryClientAccountRepository();
  const tenderRepository = new InMemoryTenderRepository();

  void clientAccountRepository.create(ClientAccount.create({ id: CLIENT, organizationId: ORG, name: "Client A", createdBy: "user-owner", occurredAt: NOW }));
  void tenderRepository.seed(Tender.create({ id: TenderId.from(TENDER), organizationId: ORG, clientAccountId: CLIENT, title: "A", createdBy: "user-owner", occurredAt: NOW }));

  const getTenderUseCase = new GetTenderUseCase(tenderRepository, assertClientAccessUseCase);
  const create = new CreatePricingEstimateUseCase(
    pricingEstimateRepository,
    getTenderUseCase,
    assertClientAccessUseCase,
    auditLogWriter,
    clock,
    idGenerator,
    new FakeRoutingModelReader(ROUTED_MODEL),
    new FakePricingSnapshotReader(MODEL_PRICING),
  );
  const compare = new CompareEstimatedAndActualCostUseCase(pricingEstimateRepository, generationCostReader, assertClientAccessUseCase, clock);

  return { create, compare, generationCostReader };
}

describe("CompareEstimatedAndActualCostUseCase", () => {
  let h: ReturnType<typeof buildHarness>;
  beforeEach(() => {
    h = buildHarness();
  });

  it("compares the estimate's AI_COST line to the real aggregated cost and computes both differences", async () => {
    const estimate = await h.create.execute({
      organizationId: ORG,
      actorId: "user-owner",
      actorRole: "OWNER",
      tenderId: TENDER,
      taskType: "EXECUTIVE_SUMMARY",
      assumptions: { estimatedGenerationsCount: 1, estimatedInputTokensPerGeneration: 1_000_000, estimatedOutputTokensPerGeneration: 0 },
    });
    // Estimated AI cost = 1,000,000 tokens @ 10€/M = 10€.
    expect(estimate.currentVersion.amount).toBe("10.000000");

    h.generationCostReader.rows.push(row({ costAmount: "12.500000", currency: "EUR", totalTokenCount: 100 }));

    const comparison = await h.compare.execute({ organizationId: ORG, actorId: "user-owner", actorRole: "OWNER", estimateId: estimate.id });
    expect(comparison.actualStatus).toBe("AVAILABLE");
    expect(comparison.estimatedAiCostAmount).toBe("10.000000");
    expect(comparison.actualAiCostAmount).toBe("12.500000");
    expect(comparison.absoluteDifference).toBe("2.500000");
    expect(comparison.percentageDifference).toBe("25.00");
  });

  it("never divides by zero — a zero estimated amount yields an undefined percentage, not an error", async () => {
    const estimate = await h.create.execute({
      organizationId: ORG,
      actorId: "user-owner",
      actorRole: "OWNER",
      tenderId: TENDER,
      taskType: "EXECUTIVE_SUMMARY",
      assumptions: { estimatedGenerationsCount: 0, estimatedInputTokensPerGeneration: 0, estimatedOutputTokensPerGeneration: 0, additionalFeesAmount: "0" },
    });

    h.generationCostReader.rows.push(row({ costAmount: "5", currency: "EUR", totalTokenCount: 10 }));
    const comparison = await h.compare.execute({ organizationId: ORG, actorId: "user-owner", actorRole: "OWNER", estimateId: estimate.id });
    expect(comparison.percentageDifference).toBeUndefined();
  });

  it("reports UNKNOWN when no real generation data exists yet for the Tender", async () => {
    const estimate = await h.create.execute({
      organizationId: ORG,
      actorId: "user-owner",
      actorRole: "OWNER",
      tenderId: TENDER,
      taskType: "EXECUTIVE_SUMMARY",
      assumptions: { estimatedGenerationsCount: 1, estimatedInputTokensPerGeneration: 1_000_000, estimatedOutputTokensPerGeneration: 0 },
    });

    const comparison = await h.compare.execute({ organizationId: ORG, actorId: "user-owner", actorRole: "OWNER", estimateId: estimate.id });
    expect(comparison.actualStatus).toBe("UNKNOWN");
    expect(comparison.actualAiCostAmount).toBeUndefined();
  });

  it("flags CURRENCY_MISMATCH instead of silently converting when the actual cost currency differs", async () => {
    const estimate = await h.create.execute({
      organizationId: ORG,
      actorId: "user-owner",
      actorRole: "OWNER",
      tenderId: TENDER,
      taskType: "EXECUTIVE_SUMMARY",
      assumptions: { estimatedGenerationsCount: 1, estimatedInputTokensPerGeneration: 1_000_000, estimatedOutputTokensPerGeneration: 0 },
    });

    h.generationCostReader.rows.push(row({ costAmount: "5", currency: "USD", totalTokenCount: 10 }));
    const comparison = await h.compare.execute({ organizationId: ORG, actorId: "user-owner", actorRole: "OWNER", estimateId: estimate.id });
    expect(comparison.actualStatus).toBe("CURRENCY_MISMATCH");
    expect(comparison.actualAiCostAmount).toBeUndefined();
  });

  it("flags CURRENCY_MISMATCH when the actual cost is spread across more than one currency (never aggregated)", async () => {
    const estimate = await h.create.execute({
      organizationId: ORG,
      actorId: "user-owner",
      actorRole: "OWNER",
      tenderId: TENDER,
      taskType: "EXECUTIVE_SUMMARY",
      assumptions: { estimatedGenerationsCount: 1, estimatedInputTokensPerGeneration: 1_000_000, estimatedOutputTokensPerGeneration: 0 },
    });

    h.generationCostReader.rows.push(row({ costAmount: "5", currency: "EUR", totalTokenCount: 10 }));
    h.generationCostReader.rows.push(row({ generationId: "gen-y", costAmount: "3", currency: "USD", totalTokenCount: 10 }));
    const comparison = await h.compare.execute({ organizationId: ORG, actorId: "user-owner", actorRole: "OWNER", estimateId: estimate.id });
    expect(comparison.actualStatus).toBe("CURRENCY_MISMATCH");
  });

  it("réaudit Sprint 7 — the difference is negative (using Decimal, never a Number) when the actual cost is lower than estimated", async () => {
    const estimate = await h.create.execute({
      organizationId: ORG,
      actorId: "user-owner",
      actorRole: "OWNER",
      tenderId: TENDER,
      taskType: "EXECUTIVE_SUMMARY",
      assumptions: { estimatedGenerationsCount: 1, estimatedInputTokensPerGeneration: 1_000_000, estimatedOutputTokensPerGeneration: 0 },
    });

    h.generationCostReader.rows.push(row({ costAmount: "4.000000", currency: "EUR", totalTokenCount: 100 }));
    const comparison = await h.compare.execute({ organizationId: ORG, actorId: "user-owner", actorRole: "OWNER", estimateId: estimate.id });
    expect(comparison.absoluteDifference).toBe("-6.000000");
    expect(comparison.percentageDifference).toBe("-60.00");
  });
});
