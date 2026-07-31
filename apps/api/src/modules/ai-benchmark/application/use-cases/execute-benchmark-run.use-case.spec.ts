import { beforeEach, describe, expect, it } from "vitest";
import { PromptKey } from "../../../analysis";
import { AiModel } from "../../domain/ai-model.aggregate";
import { BenchmarkCase } from "../../domain/benchmark-case.entity";
import { BenchmarkCaseResult } from "../../domain/benchmark-case-result.entity";
import { BenchmarkRun } from "../../domain/benchmark-run.aggregate";
import { BenchmarkRunModel } from "../../domain/benchmark-run-model.entity";
import { BenchmarkRunStatus } from "../../domain/benchmark-run-status";
import { BenchmarkSuite } from "../../domain/benchmark-suite.aggregate";
import { AiModelPricingSnapshot } from "../../domain/pricing-snapshot.entity";
import {
  FakeAIProvider,
  FakeAIProviderRegistry,
  FakePromptTemplatePort,
  FixedClock,
  InMemoryAiModelRepository,
  InMemoryAuditLogWriter,
  InMemoryBenchmarkCaseRepository,
  InMemoryBenchmarkCaseResultRepository,
  InMemoryBenchmarkRunRepository,
  InMemoryBenchmarkSuiteRepository,
  InMemoryPricingSnapshotRepository,
  SequentialIdGenerator,
  TEST_AI_BENCHMARK_CONFIG,
} from "../../test-support/fakes";
import { ExecuteBenchmarkRunUseCase } from "./execute-benchmark-run.use-case";

const NOW = new Date("2026-07-30T10:00:00Z");

describe("ExecuteBenchmarkRunUseCase", () => {
  let benchmarkRunRepository: InMemoryBenchmarkRunRepository;
  let benchmarkSuiteRepository: InMemoryBenchmarkSuiteRepository;
  let benchmarkCaseRepository: InMemoryBenchmarkCaseRepository;
  let benchmarkCaseResultRepository: InMemoryBenchmarkCaseResultRepository;
  let aiModelRepository: InMemoryAiModelRepository;
  let pricingSnapshotRepository: InMemoryPricingSnapshotRepository;
  let modelId: string;
  let suiteId: string;

  async function seedRun(input: { repetitions: number; concurrencyLimit?: number }): Promise<BenchmarkRun> {
    const run = BenchmarkRun.create({
      id: "run-1",
      organizationId: "org-1",
      suiteId,
      suiteVersion: 1,
      repetitions: input.repetitions,
      concurrencyLimit: input.concurrencyLimit ?? 1,
      estimatedCostAmount: "1",
      estimatedCostCurrency: "USD",
      launchedByUserId: "user-1",
      occurredAt: NOW,
    });
    await benchmarkRunRepository.createWithModels(run, [
      BenchmarkRunModel.create({
        id: "rm-1",
        runId: run.id,
        aiModelId: modelId,
        pricingSnapshotId: "snap-1",
        pricingCurrency: "USD",
        pricingInputPricePerMillionTokens: "5",
        pricingOutputPricePerMillionTokens: "15",
        pricingEffectiveFrom: NOW,
        occurredAt: NOW,
      }),
    ]);
    return run;
  }

  function buildUseCase(provider: FakeAIProvider): ExecuteBenchmarkRunUseCase {
    return new ExecuteBenchmarkRunUseCase(
      benchmarkRunRepository,
      benchmarkSuiteRepository,
      benchmarkCaseRepository,
      benchmarkCaseResultRepository,
      aiModelRepository,
      new InMemoryAuditLogWriter(),
      new FakeAIProviderRegistry(provider),
      new FakePromptTemplatePort(),
      TEST_AI_BENCHMARK_CONFIG,
      new FixedClock(NOW),
      new SequentialIdGenerator(),
    );
  }

  beforeEach(async () => {
    benchmarkRunRepository = new InMemoryBenchmarkRunRepository();
    benchmarkSuiteRepository = new InMemoryBenchmarkSuiteRepository();
    benchmarkCaseRepository = new InMemoryBenchmarkCaseRepository();
    benchmarkCaseResultRepository = new InMemoryBenchmarkCaseResultRepository();
    aiModelRepository = new InMemoryAiModelRepository();
    pricingSnapshotRepository = new InMemoryPricingSnapshotRepository();

    const model = AiModel.create({
      id: "model-1",
      provider: "OPENAI",
      modelKey: "gpt-4o-mini",
      displayName: "GPT-4o mini",
      enabledForBenchmark: true,
      occurredAt: NOW,
    });
    await aiModelRepository.create(model);
    modelId = model.id;

    await pricingSnapshotRepository.addSnapshot(
      AiModelPricingSnapshot.create({
        id: "snap-1",
        aiModelId: modelId,
        inputPricePerMillionTokens: "5",
        outputPricePerMillionTokens: "15",
        currency: "USD",
        occurredAt: NOW,
      }),
    );

    const suite = BenchmarkSuite.create({
      id: "suite-1",
      name: "Golden dataset",
      promptKey: PromptKey.AnalyzeDocument,
      createdByUserId: "user-1",
      occurredAt: NOW,
    });
    await benchmarkSuiteRepository.create(suite);
    suiteId = suite.id;
    await benchmarkCaseRepository.create(
      BenchmarkCase.create({
        id: "case-1",
        suiteId,
        inputVariables: { text: "La date limite est le 30 septembre 2026." },
        expectedOutput: { submissionDeadline: "2026-09-30" },
        difficulty: "EASY",
        language: "FR",
        occurredAt: NOW,
      }),
    );
  });

  it("executes every case×model×repetition, persists a result for each, and completes SUCCEEDED when all succeed", async () => {
    const run = await seedRun({ repetitions: 2 });
    const provider = new FakeAIProvider([{ kind: "success", content: JSON.stringify({ submissionDeadline: "2026-09-30" }) }]);
    const useCase = buildUseCase(provider);

    await useCase.execute({ organizationId: "org-1", runId: run.id });

    const results = await benchmarkCaseResultRepository.listByRun({ runId: run.id });
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.evaluationPassed)).toBe(true);
    expect(results.every((r) => r.actualCostAmount !== undefined)).toBe(true);

    const finalRun = await benchmarkRunRepository.findById({ organizationId: "org-1", runId: run.id });
    expect(finalRun!.status).toBe(BenchmarkRunStatus.Succeeded);
  });

  it("persists a failed result (never throws) when the provider errors, and completes PARTIALLY_SUCCEEDED when mixed with a success", async () => {
    const run = await seedRun({ repetitions: 2, concurrencyLimit: 1 });
    const provider = new FakeAIProvider([
      { kind: "success", content: JSON.stringify({ submissionDeadline: "2026-09-30" }) },
      { kind: "error", error: new Error("simulated provider outage") },
    ]);
    const useCase = buildUseCase(provider);

    await useCase.execute({ organizationId: "org-1", runId: run.id });

    const results = await benchmarkCaseResultRepository.listByRun({ runId: run.id });
    expect(results).toHaveLength(2);
    expect(results.filter((r) => r.errorCode !== undefined)).toHaveLength(1);

    const finalRun = await benchmarkRunRepository.findById({ organizationId: "org-1", runId: run.id });
    expect(finalRun!.status).toBe(BenchmarkRunStatus.PartiallySucceeded);
  });

  it("completes FAILED when every attempt errors", async () => {
    const run = await seedRun({ repetitions: 1 });
    const provider = new FakeAIProvider([{ kind: "error", error: new Error("down") }]);
    const useCase = buildUseCase(provider);

    await useCase.execute({ organizationId: "org-1", runId: run.id });

    const finalRun = await benchmarkRunRepository.findById({ organizationId: "org-1", runId: run.id });
    expect(finalRun!.status).toBe(BenchmarkRunStatus.Failed);
  });

  it("respects a cancellation requested before execution starts: no case results, run ends CANCELLED", async () => {
    const run = await seedRun({ repetitions: 3 });
    run.requestCancel("user-2", NOW);
    await benchmarkRunRepository.save(run);

    const provider = new FakeAIProvider([{ kind: "success" }]);
    const useCase = buildUseCase(provider);

    await useCase.execute({ organizationId: "org-1", runId: run.id });

    const results = await benchmarkCaseResultRepository.listByRun({ runId: run.id });
    expect(results).toHaveLength(0);

    const finalRun = await benchmarkRunRepository.findById({ organizationId: "org-1", runId: run.id });
    expect(finalRun!.status).toBe(BenchmarkRunStatus.Cancelled);
  });

  it("is a no-op (never throws) for a run that is not PENDING", async () => {
    const run = await seedRun({ repetitions: 1 });
    run.start(NOW);
    run.complete(BenchmarkRunStatus.Succeeded, NOW);
    await benchmarkRunRepository.save(run);

    const provider = new FakeAIProvider([{ kind: "success" }]);
    const useCase = buildUseCase(provider);

    await expect(useCase.execute({ organizationId: "org-1", runId: run.id })).resolves.toBeUndefined();
    expect(await benchmarkCaseResultRepository.listByRun({ runId: run.id })).toHaveLength(0);
  });

  describe("Audit Codex P1-2 — tarif figé, jamais recalculé", () => {
    it("uses the pricing frozen on the BenchmarkRunModel, never the model's current price, even after a new snapshot is added later", async () => {
      const run = await seedRun({ repetitions: 1 });

      // Un nouveau tarif est ajouté APRÈS le lancement (avant l'exécution) — ne doit jamais
      // influencer le coût calculé pour ce run déjà lancé.
      await pricingSnapshotRepository.addSnapshot(
        AiModelPricingSnapshot.create({
          id: "snap-2",
          aiModelId: modelId,
          inputPricePerMillionTokens: "999",
          outputPricePerMillionTokens: "999",
          currency: "USD",
          occurredAt: new Date(NOW.getTime() + 1000),
        }),
      );

      const provider = new FakeAIProvider([{ kind: "success", content: JSON.stringify({ submissionDeadline: "2026-09-30" }) }]);
      const useCase = buildUseCase(provider);
      await useCase.execute({ organizationId: "org-1", runId: run.id });

      const [result] = await benchmarkCaseResultRepository.listByRun({ runId: run.id });
      // Tarif figé : 5 USD/M input, 15 USD/M output (jamais 999/999 du nouveau snapshot).
      expect(Number(result!.actualCostAmount)).toBeLessThan(1);
      expect(result!.pricingSnapshotId).toBe("snap-1");
    });

    it("computes the cost with Decimal precision for a large token count (no floating-point drift)", async () => {
      const run = await seedRun({ repetitions: 1 });
      const provider = new FakeAIProvider([
        {
          kind: "success",
          content: JSON.stringify({ submissionDeadline: "2026-09-30" }),
          usage: { inputTokens: 1_234_567, outputTokens: 7_654_321 },
        },
      ]);
      const useCase = buildUseCase(provider);
      await useCase.execute({ organizationId: "org-1", runId: run.id });

      const [result] = await benchmarkCaseResultRepository.listByRun({ runId: run.id });
      // (1234567/1e6 * 5) + (7654321/1e6 * 15) = 6.172835 + 114.814815 = 120.987650
      expect(result!.actualCostAmount).toBe("120.987650");
    });
  });

  describe("Audit Codex P1-3 — idempotence sur reprise", () => {
    it("never recomputes or duplicates a result that was already persisted before a resumed execution", async () => {
      const run = await seedRun({ repetitions: 2, concurrencyLimit: 1 });

      // Simule une reprise après crash : une répétition a déjà un résultat persisté.
      await benchmarkCaseResultRepository.create(
        BenchmarkCaseResult.create({
          id: "pre-existing",
          runId: run.id,
          caseId: "case-1",
          aiModelId: modelId,
          repetitionIndex: 1,
          evaluationPassed: true,
          evaluationScore: 0.9,
          evaluationDetails: {},
          actualCostAmount: "0.5",
          createdAt: NOW,
        }),
      );

      const provider = new FakeAIProvider([{ kind: "success", content: JSON.stringify({ submissionDeadline: "2026-09-30" }) }]);
      const useCase = buildUseCase(provider);
      await useCase.execute({ organizationId: "org-1", runId: run.id });

      const results = await benchmarkCaseResultRepository.listByRun({ runId: run.id });
      // Toujours 2 résultats au total (1 préexistant + 1 nouveau pour la répétition manquante),
      // jamais 3 — la répétition 1 n'est jamais recalculée/dupliquée.
      expect(results).toHaveLength(2);
      expect(results.find((r) => r.id === "pre-existing")!.actualCostAmount).toBe("0.5");
      expect(results.filter((r) => r.repetitionIndex === 1)).toHaveLength(1);
      expect(results.filter((r) => r.repetitionIndex === 2)).toHaveLength(1);
    });

    it("is a full no-op when every case×model×repetition already has a result (fully resumed run)", async () => {
      const run = await seedRun({ repetitions: 1 });
      await benchmarkCaseResultRepository.create(
        BenchmarkCaseResult.create({
          id: "pre-existing",
          runId: run.id,
          caseId: "case-1",
          aiModelId: modelId,
          repetitionIndex: 1,
          evaluationPassed: true,
          evaluationScore: 0.9,
          evaluationDetails: {},
          actualCostAmount: "0.5",
          createdAt: NOW,
        }),
      );

      const provider = new FakeAIProvider([{ kind: "success" }]);
      const useCase = buildUseCase(provider);
      await useCase.execute({ organizationId: "org-1", runId: run.id });

      const results = await benchmarkCaseResultRepository.listByRun({ runId: run.id });
      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe("pre-existing");

      const finalRun = await benchmarkRunRepository.findById({ organizationId: "org-1", runId: run.id });
      expect(finalRun!.status).toBe(BenchmarkRunStatus.Succeeded);
    });
  });
});
