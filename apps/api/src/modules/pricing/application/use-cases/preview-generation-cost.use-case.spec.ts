import { beforeEach, describe, expect, it } from "vitest";
import { PreviewGenerationCostUseCase } from "./preview-generation-cost.use-case";
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
} from "../../test-support/fakes";
import type { CurrentModelPricing } from "../ports/pricing-snapshot-reader";
import type { RoutedModel } from "../ports/routing-model-reader";

const ORG = "org-1";
const CLIENT = "client-1";
const TENDER = "tender-1";
const NOW = new Date("2026-08-15T10:00:00.000Z");

const ROUTED_MODEL: RoutedModel = { aiModelId: "model-1", provider: "OPENAI", modelKey: "gpt-4o-mini" };
const MODEL_PRICING: CurrentModelPricing = {
  aiModelId: "model-1",
  provider: "OPENAI",
  modelKey: "gpt-4o-mini",
  inputPricePerMillionTokens: "5",
  outputPricePerMillionTokens: "15",
  currency: "USD",
  effectiveFrom: NOW,
};

function buildHarness(options: { routedModel?: RoutedModel | null; modelPricing?: CurrentModelPricing | null } = {}) {
  const clock = new FixedClock(NOW);
  const auditLogWriter = new InMemoryAuditLogWriter();
  const generationCostReader = new InMemoryGenerationCostReader();
  const { assertClientAccessUseCase, clientAssignmentRepository } = buildAssertClientAccessUseCase();
  const clientAccountRepository = new InMemoryClientAccountRepository();
  const tenderRepository = new InMemoryTenderRepository();

  void clientAccountRepository.create(ClientAccount.create({ id: CLIENT, organizationId: ORG, name: "Client A", createdBy: "user-owner", occurredAt: NOW }));
  void tenderRepository.seed(
    Tender.create({ id: TenderId.from(TENDER), organizationId: ORG, clientAccountId: CLIENT, title: "Marché", createdBy: "user-owner", occurredAt: NOW }),
  );

  const getTenderUseCase = new GetTenderUseCase(tenderRepository, assertClientAccessUseCase);
  const routingModelReader = new FakeRoutingModelReader(options.routedModel === undefined ? ROUTED_MODEL : options.routedModel);
  const pricingSnapshotReader = new FakePricingSnapshotReader(options.modelPricing === undefined ? MODEL_PRICING : options.modelPricing);

  const preview = new PreviewGenerationCostUseCase(
    getTenderUseCase,
    assertClientAccessUseCase,
    routingModelReader,
    pricingSnapshotReader,
    generationCostReader,
    auditLogWriter,
    clock,
  );

  return { preview, generationCostReader, clientAssignmentRepository, routingModelReader };
}

describe("PreviewGenerationCostUseCase", () => {
  let h: ReturnType<typeof buildHarness>;
  beforeEach(() => {
    h = buildHarness();
  });

  it("prices the model really used at call time — the actor's own model preference applies, as during the generation", async () => {
    await h.preview.execute({ organizationId: ORG, actorId: "user-owner", actorRole: "OWNER", tenderId: TENDER, taskType: "EXECUTIVE_SUMMARY" });
    expect(h.routingModelReader.calls).toEqual([{ organizationId: ORG, taskType: "EXECUTIVE_SUMMARY", userId: "user-owner" }]);
  });

  it("never prices another model: the model really used has no registered price → PARTIAL, without any AI cost line", async () => {
    const h2 = buildHarness({ routedModel: { provider: "OPENAI", modelKey: "gpt-5.4-mini" } });
    const result = await h2.preview.execute({
      organizationId: ORG,
      actorId: "user-owner",
      actorRole: "OWNER",
      tenderId: TENDER,
      taskType: "EXECUTIVE_SUMMARY",
      estimatedGenerationsCount: 1,
      estimatedInputTokensPerGeneration: 1000,
      estimatedOutputTokensPerGeneration: 1000,
    });
    // Contrat de `calculateEstimateBreakdown` : tarif du modèle inconnu → composante inconnue,
    // statut PARTIAL, aucune ligne « Coût IA » (jamais le tarif d'un autre modèle).
    expect(result.status).toBe("PARTIAL");
    expect(result.breakdown).toEqual([]);
    expect(result.modelKey).toBe("gpt-5.4-mini");
  });

  it("computes a preview using the caller-provided token volumes, never persisted", async () => {
    const result = await h.preview.execute({
      organizationId: ORG,
      actorId: "user-owner",
      actorRole: "OWNER",
      tenderId: TENDER,
      taskType: "EXECUTIVE_SUMMARY",
      estimatedGenerationsCount: 2,
      estimatedInputTokensPerGeneration: 500_000,
      estimatedOutputTokensPerGeneration: 0,
    });
    expect(result.status).toBe("CALCULATED");
    expect(result.amount).toBe("5.000000"); // 1,000,000 tokens @ $5/M
    expect(result.usedHistoricalAverage).toBe(false);
    expect(result.disclaimerText).toContain("indicative et non contractuelle");
  });

  it("falls back to the organization's historical average when no token volume is provided, and flags it explicitly", async () => {
    h.generationCostReader.averageOverride = { averageInputTokens: 200_000, averageOutputTokens: 100_000, sampleSize: 5 };
    const result = await h.preview.execute({
      organizationId: ORG,
      actorId: "user-owner",
      actorRole: "OWNER",
      tenderId: TENDER,
      taskType: "EXECUTIVE_SUMMARY",
    });
    expect(result.usedHistoricalAverage).toBe(true);
    expect(result.status).toBe("CALCULATED");
  });

  it("returns UNKNOWN (never 0) when the task type has no routed model and no historical average exists", async () => {
    const h2 = buildHarness({ routedModel: null });
    const result = await h2.preview.execute({ organizationId: ORG, actorId: "user-owner", actorRole: "OWNER", tenderId: TENDER, taskType: "EXECUTIVE_SUMMARY" });
    expect(result.status).toBe("UNKNOWN");
    expect(result.amount).toBeUndefined();
  });

  it("un acteur non affecté au client ne peut pas prévisualiser (404)", async () => {
    await expect(
      h.preview.execute({ organizationId: ORG, actorId: "user-unassigned", actorRole: "CONTRIBUTOR", tenderId: TENDER, taskType: "EXECUTIVE_SUMMARY" }),
    ).rejects.toMatchObject({ code: "CLIENT_ACCOUNT_NOT_FOUND" });
  });
});
