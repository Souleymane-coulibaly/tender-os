import { Logger, Module, type OnModuleInit } from "@nestjs/common";
import { BackgroundTaskRunner } from "../../shared-kernel/background-task-runner";
import { AnalysisModule } from "../analysis";
import { IdentityModule } from "../identity";
import { MembershipsModule } from "../memberships";
import { AI_MODEL_REPOSITORY } from "./application/ports/ai-model.repository";
import { AUDIT_LOG_WRITER } from "./application/ports/audit-log-writer";
import { BENCHMARK_CASE_REPOSITORY } from "./application/ports/benchmark-case.repository";
import { BENCHMARK_CASE_RESULT_REPOSITORY } from "./application/ports/benchmark-case-result.repository";
import { BENCHMARK_RUN_DISPATCHER } from "./application/ports/benchmark-run-dispatcher";
import { BENCHMARK_RUN_REPOSITORY } from "./application/ports/benchmark-run.repository";
import { BENCHMARK_SUITE_REPOSITORY } from "./application/ports/benchmark-suite.repository";
import { MODEL_RECOMMENDATION_REPOSITORY } from "./application/ports/model-recommendation.repository";
import { PRICING_SNAPSHOT_REPOSITORY } from "./application/ports/pricing-snapshot.repository";
import { ROUTING_POLICY_REPOSITORY } from "./application/ports/routing-policy.repository";
import { ActivateRoutingPolicyUseCase } from "./application/use-cases/activate-routing-policy.use-case";
import { AddBenchmarkCaseUseCase } from "./application/use-cases/add-benchmark-case.use-case";
import { AddPricingSnapshotUseCase } from "./application/use-cases/add-pricing-snapshot.use-case";
import { ApproveModelRecommendationUseCase } from "./application/use-cases/approve-model-recommendation.use-case";
import { ArchiveRoutingPolicyUseCase } from "./application/use-cases/archive-routing-policy.use-case";
import { CancelBenchmarkRunUseCase } from "./application/use-cases/cancel-benchmark-run.use-case";
import { CreateRoutingPolicyUseCase } from "./application/use-cases/create-routing-policy.use-case";
import { CreateAiModelUseCase } from "./application/use-cases/create-ai-model.use-case";
import { CreateBenchmarkSuiteUseCase } from "./application/use-cases/create-benchmark-suite.use-case";
import { CreateNextBenchmarkSuiteVersionUseCase } from "./application/use-cases/create-next-benchmark-suite-version.use-case";
import { DisableAiModelUseCase } from "./application/use-cases/disable-ai-model.use-case";
import { EnableAiModelUseCase } from "./application/use-cases/enable-ai-model.use-case";
import { EstimateBenchmarkRunCostUseCase } from "./application/use-cases/estimate-benchmark-run-cost.use-case";
import { ExecuteBenchmarkRunUseCase } from "./application/use-cases/execute-benchmark-run.use-case";
import { GetAiModelUseCase } from "./application/use-cases/get-ai-model.use-case";
import { GetBenchmarkRunResultsUseCase } from "./application/use-cases/get-benchmark-run-results.use-case";
import { GetBenchmarkRunUseCase } from "./application/use-cases/get-benchmark-run.use-case";
import { GetBenchmarkSuiteUseCase } from "./application/use-cases/get-benchmark-suite.use-case";
import { GetModelRecommendationUseCase } from "./application/use-cases/get-model-recommendation.use-case";
import { GetRoutingPolicyUseCase } from "./application/use-cases/get-routing-policy.use-case";
import { GenerateModelRecommendationUseCase } from "./application/use-cases/generate-model-recommendation.use-case";
import { LaunchBenchmarkRunUseCase } from "./application/use-cases/launch-benchmark-run.use-case";
import { ListAiModelsUseCase } from "./application/use-cases/list-ai-models.use-case";
import { ListBenchmarkRunsUseCase } from "./application/use-cases/list-benchmark-runs.use-case";
import { ListBenchmarkSuitesUseCase } from "./application/use-cases/list-benchmark-suites.use-case";
import { ListModelRecommendationsUseCase } from "./application/use-cases/list-model-recommendations.use-case";
import { ListPricingSnapshotsUseCase } from "./application/use-cases/list-pricing-snapshots.use-case";
import { ListRoutingPoliciesUseCase } from "./application/use-cases/list-routing-policies.use-case";
import { PublishBenchmarkSuiteUseCase } from "./application/use-cases/publish-benchmark-suite.use-case";
import { RecoverStaleBenchmarkRunsUseCase } from "./application/use-cases/recover-stale-benchmark-runs.use-case";
import { RejectModelRecommendationUseCase } from "./application/use-cases/reject-model-recommendation.use-case";
import { UpdateAiModelUseCase } from "./application/use-cases/update-ai-model.use-case";
import { AI_BENCHMARK_CONFIG, loadAiBenchmarkConfig } from "./infrastructure/ai-benchmark-config";
import { InProcessBenchmarkRunDispatcher } from "./infrastructure/in-process-benchmark-run.dispatcher";
import { PrismaAiModelRepository } from "./infrastructure/prisma-ai-model.repository";
import { PrismaAuditLogWriter } from "./infrastructure/prisma-audit-log.writer";
import { PrismaBenchmarkCaseRepository } from "./infrastructure/prisma-benchmark-case.repository";
import { PrismaBenchmarkCaseResultRepository } from "./infrastructure/prisma-benchmark-case-result.repository";
import { PrismaBenchmarkRunRepository } from "./infrastructure/prisma-benchmark-run.repository";
import { PrismaBenchmarkSuiteRepository } from "./infrastructure/prisma-benchmark-suite.repository";
import { PrismaModelRecommendationRepository } from "./infrastructure/prisma-model-recommendation.repository";
import { PrismaPricingSnapshotRepository } from "./infrastructure/prisma-pricing-snapshot.repository";
import { PrismaRoutingPolicyRepository } from "./infrastructure/prisma-routing-policy.repository";
import { AiModelsController } from "./interfaces/http/ai-models.controller";
import { BenchmarkRunsController } from "./interfaces/http/benchmark-runs.controller";
import { BenchmarkSuitesController } from "./interfaces/http/benchmark-suites.controller";
import { ModelRecommendationsController } from "./interfaces/http/model-recommendations.controller";
import { RoutingPoliciesController } from "./interfaces/http/routing-policies.controller";

/**
 * Module ai-benchmark (Sprint 5.2) — importe `AnalysisModule` dans UN SEUL sens (réutilise
 * `PromptKey`/`AnalysisProvider`/`AIProviderRegistry`/`PromptTemplatePort`) : `analysis` n'importe
 * jamais ce module en retour, évitant tout cycle Nest. Le pont vers `ProcessAnalysisJobUseCase`
 * (résolution de routing) passera par un module `@Global()` séparé une fois la Phase 6 atteinte.
 */
@Module({
  imports: [IdentityModule, MembershipsModule, AnalysisModule],
  controllers: [
    AiModelsController,
    BenchmarkSuitesController,
    BenchmarkRunsController,
    ModelRecommendationsController,
    RoutingPoliciesController,
  ],
  providers: [
    // Checkpoint TENDEROS-2.1-P2.3-E12.3 — fourni PAR CE MODULE (jamais globalement) :
    // Nest detruit les modules metier AVANT `DatabaseModule`, donc le travail de fond encore en vol
    // est attendu avant la deconnexion Prisma. Voir `BackgroundTaskRunner` pour le contrat complet.
    BackgroundTaskRunner,
    CreateAiModelUseCase,
    UpdateAiModelUseCase,
    EnableAiModelUseCase,
    DisableAiModelUseCase,
    ListAiModelsUseCase,
    GetAiModelUseCase,
    AddPricingSnapshotUseCase,
    ListPricingSnapshotsUseCase,

    CreateBenchmarkSuiteUseCase,
    CreateNextBenchmarkSuiteVersionUseCase,
    AddBenchmarkCaseUseCase,
    PublishBenchmarkSuiteUseCase,
    ListBenchmarkSuitesUseCase,
    GetBenchmarkSuiteUseCase,

    EstimateBenchmarkRunCostUseCase,
    LaunchBenchmarkRunUseCase,
    ExecuteBenchmarkRunUseCase,
    CancelBenchmarkRunUseCase,
    ListBenchmarkRunsUseCase,
    GetBenchmarkRunUseCase,
    GetBenchmarkRunResultsUseCase,
    RecoverStaleBenchmarkRunsUseCase,

    GenerateModelRecommendationUseCase,
    ApproveModelRecommendationUseCase,
    RejectModelRecommendationUseCase,
    ListModelRecommendationsUseCase,
    GetModelRecommendationUseCase,

    CreateRoutingPolicyUseCase,
    ActivateRoutingPolicyUseCase,
    ArchiveRoutingPolicyUseCase,
    ListRoutingPoliciesUseCase,
    GetRoutingPolicyUseCase,

    { provide: AI_MODEL_REPOSITORY, useClass: PrismaAiModelRepository },
    { provide: PRICING_SNAPSHOT_REPOSITORY, useClass: PrismaPricingSnapshotRepository },
    { provide: BENCHMARK_SUITE_REPOSITORY, useClass: PrismaBenchmarkSuiteRepository },
    { provide: BENCHMARK_CASE_REPOSITORY, useClass: PrismaBenchmarkCaseRepository },
    { provide: BENCHMARK_RUN_REPOSITORY, useClass: PrismaBenchmarkRunRepository },
    { provide: BENCHMARK_CASE_RESULT_REPOSITORY, useClass: PrismaBenchmarkCaseResultRepository },
    { provide: MODEL_RECOMMENDATION_REPOSITORY, useClass: PrismaModelRecommendationRepository },
    { provide: ROUTING_POLICY_REPOSITORY, useClass: PrismaRoutingPolicyRepository },
    { provide: BENCHMARK_RUN_DISPATCHER, useClass: InProcessBenchmarkRunDispatcher },
    { provide: AUDIT_LOG_WRITER, useClass: PrismaAuditLogWriter },
    // Mission §"Configuration" — jamais une variable obligatoire au démarrage, même motif que
    // ANALYSIS_CONFIG.
    { provide: AI_BENCHMARK_CONFIG, useFactory: () => loadAiBenchmarkConfig() },
  ],
})
export class AiBenchmarkModule implements OnModuleInit {
  private readonly logger = new Logger(AiBenchmarkModule.name);

  constructor(private readonly recoverStaleBenchmarkRunsUseCase: RecoverStaleBenchmarkRunsUseCase) {}

  /** Audit Codex P1-3 — récupération déterministe AU DÉMARRAGE (mission "une récupération
   *  déterministe au démarrage ou via un use case dédié est acceptable") : un run resté RUNNING
   *  suite à un crash/redéploiement précédent est détecté et repris/marqué FAILED avant que
   *  l'application ne serve du trafic. Ne doit jamais empêcher le démarrage de l'application si le
   *  sweep échoue (ex. base indisponible au tout premier instant) — erreur journalisée, jamais
   *  propagée. */
  async onModuleInit(): Promise<void> {
    try {
      const result = await this.recoverStaleBenchmarkRunsUseCase.execute();
      if (result.retried > 0 || result.exhausted > 0) {
        this.logger.log(`Stale benchmark run recovery at boot: ${result.retried} retried, ${result.exhausted} exhausted.`);
      }
    } catch (error) {
      this.logger.error(
        `Stale benchmark run recovery failed at boot (application startup continues): ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
