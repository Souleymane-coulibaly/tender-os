import { beforeEach, describe, expect, it } from "vitest";
import { PromptKey } from "../../../analysis";
import { AiModel } from "../../domain/ai-model.aggregate";
import { BenchmarkCaseResult } from "../../domain/benchmark-case-result.entity";
import { BenchmarkRun } from "../../domain/benchmark-run.aggregate";
import { BenchmarkRunStatus } from "../../domain/benchmark-run-status";
import { BenchmarkSuite } from "../../domain/benchmark-suite.aggregate";
import {
  AiBenchmarkPermissionMissingError,
  BenchmarkRunNotCompletedError,
  ModelRecommendationNotDraftError,
  ModelRecommendationNotFoundError,
  NoAdmissibleModelError,
} from "../../domain/errors";
import { AiModelPricingSnapshot } from "../../domain/pricing-snapshot.entity";
import {
  FixedClock,
  InMemoryAiModelRepository,
  InMemoryAuditLogWriter,
  InMemoryBenchmarkCaseResultRepository,
  InMemoryBenchmarkRunRepository,
  InMemoryBenchmarkSuiteRepository,
  InMemoryModelRecommendationRepository,
  InMemoryPricingSnapshotRepository,
  SequentialIdGenerator,
} from "../../test-support/fakes";
import { ApproveModelRecommendationUseCase } from "./approve-model-recommendation.use-case";
import { GenerateModelRecommendationUseCase } from "./generate-model-recommendation.use-case";
import { RejectModelRecommendationUseCase } from "./reject-model-recommendation.use-case";

const NOW = new Date("2026-07-30T10:00:00Z");

describe("GenerateModelRecommendationUseCase / ApproveModelRecommendationUseCase / RejectModelRecommendationUseCase", () => {
  let benchmarkRunRepository: InMemoryBenchmarkRunRepository;
  let benchmarkSuiteRepository: InMemoryBenchmarkSuiteRepository;
  let benchmarkCaseResultRepository: InMemoryBenchmarkCaseResultRepository;
  let pricingSnapshotRepository: InMemoryPricingSnapshotRepository;
  let modelRecommendationRepository: InMemoryModelRecommendationRepository;
  let generateUseCase: GenerateModelRecommendationUseCase;
  let approveUseCase: ApproveModelRecommendationUseCase;
  let rejectUseCase: RejectModelRecommendationUseCase;
  let runId: string;

  beforeEach(async () => {
    benchmarkRunRepository = new InMemoryBenchmarkRunRepository();
    benchmarkSuiteRepository = new InMemoryBenchmarkSuiteRepository();
    benchmarkCaseResultRepository = new InMemoryBenchmarkCaseResultRepository();
    const aiModelRepository = new InMemoryAiModelRepository();
    pricingSnapshotRepository = new InMemoryPricingSnapshotRepository();
    modelRecommendationRepository = new InMemoryModelRecommendationRepository();

    generateUseCase = new GenerateModelRecommendationUseCase(
      benchmarkRunRepository,
      benchmarkSuiteRepository,
      benchmarkCaseResultRepository,
      pricingSnapshotRepository,
      modelRecommendationRepository,
      new InMemoryAuditLogWriter(),
      new FixedClock(NOW),
      new SequentialIdGenerator(),
    );
    approveUseCase = new ApproveModelRecommendationUseCase(modelRecommendationRepository, new InMemoryAuditLogWriter(), new FixedClock(NOW));
    rejectUseCase = new RejectModelRecommendationUseCase(modelRecommendationRepository, new InMemoryAuditLogWriter(), new FixedClock(NOW));

    const suite = BenchmarkSuite.create({
      id: "suite-1",
      name: "Golden dataset",
      promptKey: PromptKey.AnalyzeDocument,
      createdByUserId: "user-1",
      occurredAt: NOW,
    });
    await benchmarkSuiteRepository.create(suite);

    const run = BenchmarkRun.create({
      id: "run-1",
      organizationId: "org-1",
      suiteId: suite.id,
      suiteVersion: 1,
      repetitions: 1,
      concurrencyLimit: 1,
      estimatedCostAmount: "1",
      estimatedCostCurrency: "USD",
      launchedByUserId: "user-1",
      occurredAt: NOW,
    });
    await benchmarkRunRepository.createWithModels(run, []);
    runId = run.id;

    const goodModel = AiModel.create({
      id: "good-model",
      provider: "OPENAI",
      modelKey: "gpt-4o",
      displayName: "GPT-4o",
      enabledForBenchmark: true,
      occurredAt: NOW,
    });
    await aiModelRepository.create(goodModel);
    await pricingSnapshotRepository.addSnapshot(
      AiModelPricingSnapshot.create({
        id: "snap-good",
        aiModelId: goodModel.id,
        inputPricePerMillionTokens: "5",
        outputPricePerMillionTokens: "15",
        currency: "USD",
        occurredAt: NOW,
      }),
    );

    await benchmarkCaseResultRepository.create(
      BenchmarkCaseResult.create({
        id: "result-good",
        runId,
        caseId: "case-1",
        aiModelId: goodModel.id,
        repetitionIndex: 1,
        evaluationPassed: true,
        evaluationScore: 0.9,
        evaluationDetails: {},
        actualCostAmount: "0.02",
        durationMs: 200,
        createdAt: NOW,
      }),
    );
    await benchmarkCaseResultRepository.create(
      BenchmarkCaseResult.create({
        id: "result-bad",
        runId,
        caseId: "case-1",
        aiModelId: "bad-model",
        repetitionIndex: 1,
        evaluationPassed: false,
        evaluationScore: 0.1,
        evaluationDetails: {},
        actualCostAmount: "0.001",
        durationMs: 50,
        createdAt: NOW,
      }),
    );
  });

  it("generates a DRAFT recommendation whose primary model is the best ADMISSIBLE model — never the eliminated one, even if cheaper", async () => {
    const stored = await benchmarkRunRepository.findById({ organizationId: "org-1", runId });
    stored!.start(NOW);
    stored!.complete(BenchmarkRunStatus.PartiallySucceeded, NOW);
    await benchmarkRunRepository.save(stored!);

    const recommendation = await generateUseCase.execute({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: "OWNER",
      runId,
    });

    expect(recommendation.status).toBe("DRAFT");
    expect(recommendation.primaryAiModelId).toBe("good-model");
    expect(recommendation.primaryAiModelId).not.toBe("bad-model");
  });

  it("refuses to generate a recommendation from a run that hasn't completed", async () => {
    await expect(
      generateUseCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "OWNER", runId }),
    ).rejects.toBeInstanceOf(BenchmarkRunNotCompletedError);
  });

  it("refuses to generate a recommendation when every model is eliminated", async () => {
    const stored = await benchmarkRunRepository.findById({ organizationId: "org-1", runId });
    stored!.start(NOW);
    // Statut SUCCEEDED délibéré : "éliminé" (score de qualité insuffisant) est distinct d'"en
    // échec" (errorCode renseigné) — un modèle peut retourner un JSON valide, sans erreur
    // provider, tout en étant néanmoins éliminé pour qualité insuffisante.
    stored!.complete(BenchmarkRunStatus.Succeeded, NOW);
    await benchmarkRunRepository.save(stored!);

    // Remplace tous les résultats par des échecs pour ce test précis.
    const onlyBadResults = new InMemoryBenchmarkCaseResultRepository();
    await onlyBadResults.create(
      BenchmarkCaseResult.create({
        id: "result-bad-only",
        runId,
        caseId: "case-1",
        aiModelId: "bad-model",
        repetitionIndex: 1,
        evaluationPassed: false,
        evaluationScore: 0.1,
        evaluationDetails: {},
        createdAt: NOW,
      }),
    );
    const useCaseWithOnlyBad = new GenerateModelRecommendationUseCase(
      benchmarkRunRepository,
      benchmarkSuiteRepository,
      onlyBadResults,
      pricingSnapshotRepository,
      modelRecommendationRepository,
      new InMemoryAuditLogWriter(),
      new FixedClock(NOW),
      new SequentialIdGenerator(),
    );

    await expect(
      useCaseWithOnlyBad.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "OWNER", runId }),
    ).rejects.toBeInstanceOf(NoAdmissibleModelError);
  });

  it("refuses a non-admin actor attempting to generate", async () => {
    const stored = await benchmarkRunRepository.findById({ organizationId: "org-1", runId });
    stored!.start(NOW);
    stored!.complete(BenchmarkRunStatus.Succeeded, NOW);
    await benchmarkRunRepository.save(stored!);

    await expect(
      generateUseCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "READ_ONLY", runId }),
    ).rejects.toBeInstanceOf(AiBenchmarkPermissionMissingError);
  });

  it("approve()/reject() require DRAFT and are idempotent-safe (a second decision throws)", async () => {
    const stored = await benchmarkRunRepository.findById({ organizationId: "org-1", runId });
    stored!.start(NOW);
    stored!.complete(BenchmarkRunStatus.Succeeded, NOW);
    await benchmarkRunRepository.save(stored!);

    const recommendation = await generateUseCase.execute({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: "OWNER",
      runId,
    });

    const approved = await approveUseCase.execute({
      organizationId: "org-1",
      actorId: "user-2",
      actorRole: "OWNER",
      recommendationId: recommendation.id,
    });
    expect(approved.status).toBe("APPROVED");

    await expect(
      rejectUseCase.execute({ organizationId: "org-1", actorId: "user-2", actorRole: "OWNER", recommendationId: recommendation.id }),
    ).rejects.toBeInstanceOf(ModelRecommendationNotDraftError);
  });

  it("audit Codex P2 — breaks a tie on averageScore deterministically by aiModelId, regardless of result insertion order", async () => {
    const tieSuite = BenchmarkSuite.create({
      id: "suite-tie",
      name: "Tie-break dataset",
      promptKey: PromptKey.AnalyzeDocument,
      createdByUserId: "user-1",
      occurredAt: NOW,
    });
    await benchmarkSuiteRepository.create(tieSuite);

    const tieRun = BenchmarkRun.create({
      id: "run-tie",
      organizationId: "org-1",
      suiteId: tieSuite.id,
      suiteVersion: 1,
      repetitions: 1,
      concurrencyLimit: 1,
      estimatedCostAmount: "1",
      estimatedCostCurrency: "USD",
      launchedByUserId: "user-1",
      occurredAt: NOW,
    });
    await benchmarkRunRepository.createWithModels(tieRun, []);
    tieRun.start(NOW);
    tieRun.complete(BenchmarkRunStatus.Succeeded, NOW);
    await benchmarkRunRepository.save(tieRun);

    // Inséré délibérément dans un ordre où le modèle "zzz-model" (alphabétiquement après) arrive
    // EN PREMIER — si le tie-break dépendait de l'ordre d'insertion/lecture, il gagnerait à tort.
    await benchmarkCaseResultRepository.create(
      BenchmarkCaseResult.create({
        id: "tie-result-zzz",
        runId: tieRun.id,
        caseId: "case-1",
        aiModelId: "zzz-model",
        repetitionIndex: 1,
        evaluationPassed: true,
        evaluationScore: 0.9,
        evaluationDetails: {},
        createdAt: NOW,
      }),
    );
    await benchmarkCaseResultRepository.create(
      BenchmarkCaseResult.create({
        id: "tie-result-aaa",
        runId: tieRun.id,
        caseId: "case-1",
        aiModelId: "aaa-model",
        repetitionIndex: 1,
        evaluationPassed: true,
        evaluationScore: 0.9,
        evaluationDetails: {},
        createdAt: NOW,
      }),
    );

    const recommendation = await generateUseCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "OWNER", runId: tieRun.id });

    expect(recommendation.primaryAiModelId).toBe("aaa-model");
    expect(recommendation.escalationAiModelId).toBe("zzz-model");
  });

  it("never lets another organization approve or reject a recommendation it doesn't own", async () => {
    const stored = await benchmarkRunRepository.findById({ organizationId: "org-1", runId });
    stored!.start(NOW);
    stored!.complete(BenchmarkRunStatus.Succeeded, NOW);
    await benchmarkRunRepository.save(stored!);

    const recommendation = await generateUseCase.execute({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: "OWNER",
      runId,
    });

    await expect(
      approveUseCase.execute({ organizationId: "org-2", actorId: "intruder", actorRole: "OWNER", recommendationId: recommendation.id }),
    ).rejects.toBeInstanceOf(ModelRecommendationNotFoundError);
    await expect(
      rejectUseCase.execute({ organizationId: "org-2", actorId: "intruder", actorRole: "OWNER", recommendationId: recommendation.id }),
    ).rejects.toBeInstanceOf(ModelRecommendationNotFoundError);

    // Toujours DRAFT pour son organisation propriétaire : aucune fuite/altération inter-tenant.
    const approved = await approveUseCase.execute({
      organizationId: "org-1",
      actorId: "user-2",
      actorRole: "OWNER",
      recommendationId: recommendation.id,
    });
    expect(approved.status).toBe("APPROVED");
  });
});
