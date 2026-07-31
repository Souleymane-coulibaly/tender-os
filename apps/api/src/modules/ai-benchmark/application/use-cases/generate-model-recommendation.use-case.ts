import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import { AiBenchmarkPermission } from "../../domain/ai-benchmark-permission";
import { BenchmarkRunStatus } from "../../domain/benchmark-run-status";
import { BenchmarkRunNotCompletedError, BenchmarkRunNotFoundError, BenchmarkSuiteNotFoundError, NoAdmissibleModelError } from "../../domain/errors";
import { ModelRecommendation } from "../../domain/model-recommendation.aggregate";
import { assertHasAiBenchmarkPermission } from "../policies/ai-benchmark-authorization.policy";
import { aggregateBenchmarkRunResultsByModel } from "../services/aggregate-benchmark-run-results";
import { toModelRecommendationSummary, type ModelRecommendationSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { BENCHMARK_CASE_RESULT_REPOSITORY, type BenchmarkCaseResultRepository } from "../ports/benchmark-case-result.repository";
import { BENCHMARK_RUN_REPOSITORY, type BenchmarkRunRepository } from "../ports/benchmark-run.repository";
import { BENCHMARK_SUITE_REPOSITORY, type BenchmarkSuiteRepository } from "../ports/benchmark-suite.repository";
import { MODEL_RECOMMENDATION_REPOSITORY, type ModelRecommendationRepository } from "../ports/model-recommendation.repository";
import { PRICING_SNAPSHOT_REPOSITORY, type PricingSnapshotRepository } from "../ports/pricing-snapshot.repository";

export type GenerateModelRecommendationCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  runId: string;
  requestId?: string | undefined;
}>;

/**
 * Génère une recommandation à partir d'un run terminé (Sprint 5.2 §"Recommandations") — DRAFT
 * uniquement, jamais activée automatiquement. Le modèle principal est le mieux classé PARMI LES
 * MODÈLES ADMISSIBLES (jamais éliminés) — un modèle éliminé ne peut jamais devenir la
 * recommandation, quel que soit son score brut (mission §"un modèle éliminé ne doit pas gagner").
 * L'escalade recommandée est le second meilleur modèle admissible, s'il en existe un.
 */
@Injectable()
export class GenerateModelRecommendationUseCase {
  constructor(
    @Inject(BENCHMARK_RUN_REPOSITORY) private readonly benchmarkRunRepository: BenchmarkRunRepository,
    @Inject(BENCHMARK_SUITE_REPOSITORY) private readonly benchmarkSuiteRepository: BenchmarkSuiteRepository,
    @Inject(BENCHMARK_CASE_RESULT_REPOSITORY) private readonly benchmarkCaseResultRepository: BenchmarkCaseResultRepository,
    @Inject(PRICING_SNAPSHOT_REPOSITORY) private readonly pricingSnapshotRepository: PricingSnapshotRepository,
    @Inject(MODEL_RECOMMENDATION_REPOSITORY) private readonly modelRecommendationRepository: ModelRecommendationRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: GenerateModelRecommendationCommand): Promise<ModelRecommendationSummary> {
    assertHasAiBenchmarkPermission(command.actorRole, AiBenchmarkPermission.LaunchBenchmark);

    const run = await this.benchmarkRunRepository.findById({ organizationId: command.organizationId, runId: command.runId });
    if (!run) {
      throw new BenchmarkRunNotFoundError();
    }
    if (run.status !== BenchmarkRunStatus.Succeeded && run.status !== BenchmarkRunStatus.PartiallySucceeded) {
      throw new BenchmarkRunNotCompletedError();
    }

    const suite = await this.benchmarkSuiteRepository.findById({ id: run.suiteId });
    if (!suite) {
      throw new BenchmarkSuiteNotFoundError();
    }

    const results = await this.benchmarkCaseResultRepository.listByRun({ runId: run.id });
    // Audit Codex P2 — tie-break déterministe explicite : à score global strictement égal, l'ordre
    // ne doit jamais dépendre d'un ordre de lecture non garanti (Prisma sans `orderBy` explicite
    // sur les résultats agrégés) — `aiModelId` croissant départage toujours de la même façon.
    const comparisons = [...aggregateBenchmarkRunResultsByModel(results)].sort(
      (a, b) => b.averageScore - a.averageScore || a.aiModelId.localeCompare(b.aiModelId),
    );
    const admissible = comparisons.filter((c) => !c.eliminated);

    if (admissible.length === 0) {
      throw new NoAdmissibleModelError();
    }

    const primary = admissible[0]!;
    const escalation = admissible[1];

    const primaryPricing = await this.pricingSnapshotRepository.findCurrent({ aiModelId: primary.aiModelId });

    const reasons: string[] = [
      `Meilleur score global (${primary.averageScore.toFixed(3)}) parmi les modèles admissibles de ce run.`,
      "Aucun seuil éliminatoire déclenché (fuite tenant/client, provenance invalide, hallucination critique, taux d'échec ou de JSON invalide excessif).",
    ];
    const limitations: string[] = [
      `Basé sur un corpus synthétique de ${primary.caseResultCount} tentative(s) — pas encore validé sur des documents réels.`,
    ];
    if (!escalation) {
      limitations.push("Aucun second modèle admissible dans ce run : pas de modèle d'escalade recommandé.");
    }

    const recommendation = ModelRecommendation.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      promptKey: suite.promptKey,
      runId: run.id,
      primaryAiModelId: primary.aiModelId,
      escalationAiModelId: escalation?.aiModelId,
      score: primary.averageScore,
      avgCostAmount: primary.averageCostAmount,
      avgCostCurrency: primaryPricing?.currency ?? "USD",
      avgLatencyMs: primary.averageLatencyMs,
      confidence: primary.averageScore,
      reasons,
      limitations,
      occurredAt: this.clock.now(),
    });

    await this.modelRecommendationRepository.create(recommendation);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "model_recommendation.generated",
      resourceType: "model_recommendation",
      resourceId: recommendation.id,
      requestId: command.requestId,
      metadata: { runId: run.id, primaryAiModelId: primary.aiModelId },
    });

    return toModelRecommendationSummary(recommendation);
  }
}
