import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { AiModel } from "../domain/ai-model.aggregate";
import { AiModelPricingSnapshot } from "../domain/pricing-snapshot.entity";
import { BenchmarkRun } from "../domain/benchmark-run.aggregate";
import { BenchmarkRunModel } from "../domain/benchmark-run-model.entity";
import { PrismaAiModelRepository } from "./prisma-ai-model.repository";
import { PrismaPricingSnapshotRepository } from "./prisma-pricing-snapshot.repository";
import { PrismaBenchmarkRunRepository } from "./prisma-benchmark-run.repository";

/**
 * Audit Codex P1-2 — preuve réelle contre PostgreSQL que le tarif figé sur `BenchmarkRunModel` au
 * lancement d'un run ne change JAMAIS, même après l'ajout d'un nouveau tarif pour ce modèle. Un
 * test avec de simples fakes en mémoire ne suffit pas à démontrer que la colonne DB elle-même
 * (jamais un JOIN "tarif actuel" à la lecture) porte bien la valeur figée.
 */
describe("BenchmarkRunModel pricing freeze — audit Codex P1-2 (PostgreSQL)", () => {
  const prisma = new PrismaService();
  const aiModelRepository = new PrismaAiModelRepository(prisma);
  const pricingSnapshotRepository = new PrismaPricingSnapshotRepository(prisma);
  const benchmarkRunRepository = new PrismaBenchmarkRunRepository(prisma);

  const organizationId = randomUUID();
  const now = new Date("2026-07-31T10:00:00Z");
  let modelId: string;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.create({
      data: {
        id: organizationId,
        name: "BenchmarkRunModel Pricing Freeze Integration Test Org",
        slug: `pricing-freeze-integration-test-org-${organizationId}`,
        defaultTimezone: "Europe/Paris",
        status: "TRIAL",
      },
    });

    const model = AiModel.create({
      id: randomUUID(),
      provider: "OPENAI",
      modelKey: "gpt-4o-mini",
      displayName: "GPT-4o mini (test)",
      enabledForBenchmark: true,
      occurredAt: now,
    });
    await aiModelRepository.create(model);
    modelId = model.id;
  });

  afterAll(async () => {
    await prisma.benchmarkRunModel.deleteMany({ where: { aiModel: { id: modelId } } });
    await prisma.benchmarkRun.deleteMany({ where: { organizationId } });
    await prisma.aiModelPricingSnapshot.deleteMany({ where: { aiModelId: modelId } });
    await prisma.aiModel.deleteMany({ where: { id: modelId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  it("keeps a launched run's frozen price unchanged after a new, higher-priced snapshot is added", async () => {
    const originalSnapshot = AiModelPricingSnapshot.create({
      id: randomUUID(),
      aiModelId: modelId,
      inputPricePerMillionTokens: "5",
      outputPricePerMillionTokens: "15",
      currency: "USD",
      occurredAt: now,
    });
    await pricingSnapshotRepository.addSnapshot(originalSnapshot);

    const run = BenchmarkRun.create({
      id: randomUUID(),
      organizationId,
      suiteId: randomUUID(),
      suiteVersion: 1,
      repetitions: 1,
      concurrencyLimit: 1,
      estimatedCostAmount: "1",
      estimatedCostCurrency: "USD",
      launchedByUserId: randomUUID(),
      occurredAt: now,
    });
    const runModel = BenchmarkRunModel.create({
      id: randomUUID(),
      runId: run.id,
      aiModelId: modelId,
      pricingSnapshotId: originalSnapshot.id,
      pricingCurrency: originalSnapshot.currency,
      pricingInputPricePerMillionTokens: originalSnapshot.inputPricePerMillionTokens,
      pricingOutputPricePerMillionTokens: originalSnapshot.outputPricePerMillionTokens,
      pricingEffectiveFrom: originalSnapshot.effectiveFrom,
      occurredAt: now,
    });
    await benchmarkRunRepository.createWithModels(run, [runModel]);

    // Un tarif bien plus élevé est ajouté APRÈS le lancement du run.
    const newSnapshot = AiModelPricingSnapshot.create({
      id: randomUUID(),
      aiModelId: modelId,
      inputPricePerMillionTokens: "500",
      outputPricePerMillionTokens: "1500",
      currency: "USD",
      occurredAt: new Date(now.getTime() + 60_000),
    });
    await pricingSnapshotRepository.addSnapshot(newSnapshot);

    // Le nouveau tarif est bien devenu le tarif COURANT du modèle...
    const current = await pricingSnapshotRepository.findCurrent({ aiModelId: modelId });
    expect(current!.id).toBe(newSnapshot.id);

    // ...mais le run déjà lancé conserve son tarif figé, rechargé directement depuis la colonne DB,
    // jamais recalculé via un JOIN vers le tarif courant.
    const [reloadedRunModel] = await benchmarkRunRepository.listRunModels({ runId: run.id });
    expect(reloadedRunModel!.pricingSnapshotId).toBe(originalSnapshot.id);
    expect(Number(reloadedRunModel!.pricingInputPricePerMillionTokens)).toBe(5);
    expect(Number(reloadedRunModel!.pricingOutputPricePerMillionTokens)).toBe(15);

    const cost = reloadedRunModel!.computeCost({ inputTokens: 1_000_000, outputTokens: 1_000_000 });
    // 1M tokens à 5 USD/M (input) + 1M tokens à 15 USD/M (output) = 20 USD, jamais 2000 USD
    // (500+1500) sous le nouveau tarif.
    expect(cost).toBe("20.000000");
  });
});
