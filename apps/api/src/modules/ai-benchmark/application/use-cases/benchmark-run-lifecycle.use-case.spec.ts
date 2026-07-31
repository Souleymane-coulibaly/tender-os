import { beforeEach, describe, expect, it } from "vitest";
import { PromptKey } from "../../../analysis";
import {
  AiBenchmarkPermissionMissingError,
  AiModelNotEnabledForBenchmarkError,
  BenchmarkCostCeilingExceededError,
  BenchmarkRunNotCancellableError,
  BenchmarkRunNotFoundError,
  BenchmarkSuiteEmptyError,
} from "../../domain/errors";
import { BenchmarkRunStatus } from "../../domain/benchmark-run-status";
import { AiModel } from "../../domain/ai-model.aggregate";
import { AiModelPricingSnapshot } from "../../domain/pricing-snapshot.entity";
import { BenchmarkCase } from "../../domain/benchmark-case.entity";
import { BenchmarkSuite } from "../../domain/benchmark-suite.aggregate";
import {
  FixedClock,
  InMemoryAiModelRepository,
  InMemoryAuditLogWriter,
  InMemoryBenchmarkCaseRepository,
  InMemoryBenchmarkRunRepository,
  InMemoryBenchmarkSuiteRepository,
  InMemoryPricingSnapshotRepository,
  RecordingBenchmarkRunDispatcher,
  SequentialIdGenerator,
  TEST_AI_BENCHMARK_CONFIG,
} from "../../test-support/fakes";
import { CancelBenchmarkRunUseCase } from "./cancel-benchmark-run.use-case";
import { EstimateBenchmarkRunCostUseCase } from "./estimate-benchmark-run-cost.use-case";
import { GetBenchmarkRunUseCase } from "./get-benchmark-run.use-case";
import { LaunchBenchmarkRunUseCase } from "./launch-benchmark-run.use-case";

const NOW = new Date("2026-07-30T10:00:00Z");

describe("EstimateBenchmarkRunCostUseCase / LaunchBenchmarkRunUseCase / CancelBenchmarkRunUseCase", () => {
  let aiModelRepository: InMemoryAiModelRepository;
  let pricingSnapshotRepository: InMemoryPricingSnapshotRepository;
  let benchmarkSuiteRepository: InMemoryBenchmarkSuiteRepository;
  let benchmarkCaseRepository: InMemoryBenchmarkCaseRepository;
  let benchmarkRunRepository: InMemoryBenchmarkRunRepository;
  let dispatcher: RecordingBenchmarkRunDispatcher;
  let estimateUseCase: EstimateBenchmarkRunCostUseCase;
  let launchUseCase: LaunchBenchmarkRunUseCase;
  let cancelUseCase: CancelBenchmarkRunUseCase;
  let modelId: string;
  let suiteId: string;

  beforeEach(async () => {
    aiModelRepository = new InMemoryAiModelRepository();
    pricingSnapshotRepository = new InMemoryPricingSnapshotRepository();
    benchmarkSuiteRepository = new InMemoryBenchmarkSuiteRepository();
    benchmarkCaseRepository = new InMemoryBenchmarkCaseRepository();
    benchmarkRunRepository = new InMemoryBenchmarkRunRepository();
    dispatcher = new RecordingBenchmarkRunDispatcher();

    estimateUseCase = new EstimateBenchmarkRunCostUseCase(
      benchmarkSuiteRepository,
      benchmarkCaseRepository,
      aiModelRepository,
      pricingSnapshotRepository,
      TEST_AI_BENCHMARK_CONFIG,
    );
    launchUseCase = new LaunchBenchmarkRunUseCase(
      benchmarkSuiteRepository,
      benchmarkCaseRepository,
      aiModelRepository,
      pricingSnapshotRepository,
      benchmarkRunRepository,
      dispatcher,
      new InMemoryAuditLogWriter(),
      TEST_AI_BENCHMARK_CONFIG,
      new FixedClock(NOW),
      new SequentialIdGenerator(),
    );
    cancelUseCase = new CancelBenchmarkRunUseCase(benchmarkRunRepository, new InMemoryAuditLogWriter(), new FixedClock(NOW));

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
        inputVariables: { text: "x" },
        expectedOutput: { a: 1 },
        difficulty: "EASY",
        language: "FR",
        occurredAt: NOW,
      }),
    );
  });

  describe("EstimateBenchmarkRunCostUseCase", () => {
    it("estimates a positive cost in the model's currency", async () => {
      const estimate = await estimateUseCase.execute({ actorRole: "OWNER", suiteId, modelIds: [modelId], repetitions: 2 });
      expect(estimate.currency).toBe("USD");
      expect(Number(estimate.amount)).toBeGreaterThan(0);
    });
  });

  describe("LaunchBenchmarkRunUseCase", () => {
    it("launches a run, dispatches execution, and returns it PENDING", async () => {
      const run = await launchUseCase.execute({
        organizationId: "org-1",
        actorId: "user-1",
        actorRole: "OWNER",
        suiteId,
        modelIds: [modelId],
        repetitions: 1,
        concurrencyLimit: 1,
      });

      expect(run.status).toBe(BenchmarkRunStatus.Pending);
      expect(dispatcher.dispatched).toHaveLength(1);
      expect(dispatcher.dispatched[0]?.runId).toBe(run.id);
    });

    it("refuses to launch against an empty suite", async () => {
      const emptySuite = BenchmarkSuite.create({
        id: "suite-empty",
        name: "Empty",
        promptKey: PromptKey.AnalyzeDocument,
        createdByUserId: "user-1",
        occurredAt: NOW,
      });
      await benchmarkSuiteRepository.create(emptySuite);

      await expect(
        launchUseCase.execute({
          organizationId: "org-1",
          actorId: "user-1",
          actorRole: "OWNER",
          suiteId: emptySuite.id,
          modelIds: [modelId],
          repetitions: 1,
          concurrencyLimit: 1,
        }),
      ).rejects.toBeInstanceOf(BenchmarkSuiteEmptyError);
    });

    it("refuses a model not enabled for benchmark", async () => {
      const disabledForBenchmark = AiModel.create({
        id: "model-2",
        provider: "OPENAI",
        modelKey: "gpt-4o",
        displayName: "GPT-4o",
        enabledForBenchmark: false,
        occurredAt: NOW,
      });
      await aiModelRepository.create(disabledForBenchmark);

      await expect(
        launchUseCase.execute({
          organizationId: "org-1",
          actorId: "user-1",
          actorRole: "OWNER",
          suiteId,
          modelIds: [disabledForBenchmark.id],
          repetitions: 1,
          concurrencyLimit: 1,
        }),
      ).rejects.toBeInstanceOf(AiModelNotEnabledForBenchmarkError);
    });

    it("refuses to launch above the cost ceiling", async () => {
      await expect(
        launchUseCase.execute({
          organizationId: "org-1",
          actorId: "user-1",
          actorRole: "OWNER",
          suiteId,
          modelIds: [modelId],
          repetitions: 1,
          concurrencyLimit: 1,
          costCeilingAmount: "0.00000001",
        }),
      ).rejects.toBeInstanceOf(BenchmarkCostCeilingExceededError);
      expect(dispatcher.dispatched).toHaveLength(0);
    });
  });

  describe("CancelBenchmarkRunUseCase", () => {
    it("sets a cooperative cancel signal on a non-terminal run", async () => {
      const run = await launchUseCase.execute({
        organizationId: "org-1",
        actorId: "user-1",
        actorRole: "OWNER",
        suiteId,
        modelIds: [modelId],
        repetitions: 1,
        concurrencyLimit: 1,
      });

      const cancelled = await cancelUseCase.execute({ organizationId: "org-1", actorId: "user-2", actorRole: "OWNER", runId: run.id });
      expect(cancelled.cancelRequestedAt).toBeDefined();
      expect(cancelled.status).toBe(BenchmarkRunStatus.Pending); // signal seul, pas une transition immédiate
    });

    it("refuses to cancel a run already in a terminal state", async () => {
      const run = await benchmarkRunRepository.findById({ organizationId: "org-1", runId: "does-not-exist" });
      expect(run).toBeNull();

      const launched = await launchUseCase.execute({
        organizationId: "org-1",
        actorId: "user-1",
        actorRole: "OWNER",
        suiteId,
        modelIds: [modelId],
        repetitions: 1,
        concurrencyLimit: 1,
      });
      const stored = await benchmarkRunRepository.findById({ organizationId: "org-1", runId: launched.id });
      stored!.start(NOW);
      stored!.complete(BenchmarkRunStatus.Succeeded, NOW);
      await benchmarkRunRepository.save(stored!);

      await expect(
        cancelUseCase.execute({ organizationId: "org-1", actorId: "user-2", actorRole: "OWNER", runId: launched.id }),
      ).rejects.toBeInstanceOf(BenchmarkRunNotCancellableError);
    });
  });

  describe("Isolation inter-tenant et permissions", () => {
    it("refuses to launch a benchmark run for a role without LaunchBenchmark permission", async () => {
      await expect(
        launchUseCase.execute({
          organizationId: "org-1",
          actorId: "user-1",
          actorRole: "BID_MANAGER",
          suiteId,
          modelIds: [modelId],
          repetitions: 1,
          concurrencyLimit: 1,
        }),
      ).rejects.toBeInstanceOf(AiBenchmarkPermissionMissingError);
      expect(dispatcher.dispatched).toHaveLength(0);
    });

    it("never exposes another organization's benchmark run (get/cancel both 404, never leak)", async () => {
      const run = await launchUseCase.execute({
        organizationId: "org-1",
        actorId: "user-1",
        actorRole: "OWNER",
        suiteId,
        modelIds: [modelId],
        repetitions: 1,
        concurrencyLimit: 1,
      });

      const getUseCase = new GetBenchmarkRunUseCase(benchmarkRunRepository);
      await expect(
        getUseCase.execute({ organizationId: "org-2", actorRole: "OWNER", runId: run.id }),
      ).rejects.toBeInstanceOf(BenchmarkRunNotFoundError);

      await expect(
        cancelUseCase.execute({ organizationId: "org-2", actorId: "user-99", actorRole: "OWNER", runId: run.id }),
      ).rejects.toBeInstanceOf(BenchmarkRunNotFoundError);

      // Le run reste intact pour son organisation propriétaire.
      const stillOwned = await getUseCase.execute({ organizationId: "org-1", actorRole: "OWNER", runId: run.id });
      expect(stillOwned.id).toBe(run.id);
    });

    it("refuses to cancel a run for a role without LaunchBenchmark permission", async () => {
      const run = await launchUseCase.execute({
        organizationId: "org-1",
        actorId: "user-1",
        actorRole: "OWNER",
        suiteId,
        modelIds: [modelId],
        repetitions: 1,
        concurrencyLimit: 1,
      });

      await expect(
        cancelUseCase.execute({ organizationId: "org-1", actorId: "user-2", actorRole: "READ_ONLY", runId: run.id }),
      ).rejects.toBeInstanceOf(AiBenchmarkPermissionMissingError);
    });
  });
});
