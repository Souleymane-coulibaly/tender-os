import { Module } from "@nestjs/common";
import { ExtractionModule } from "../extraction";
import { IdentityModule } from "../identity";
import { MembershipsModule } from "../memberships";
import { TendersModule } from "../tenders";

import { AUDIT_LOG_WRITER } from "./application/ports/audit-log-writer";
import { AI_PROVIDER_REGISTRY } from "./application/ports/ai-provider-registry";
import { ANALYSIS_ATTEMPT_REPOSITORY } from "./application/ports/analysis-attempt.repository";
import { ANALYSIS_CONTENT_RESOLVER } from "./application/ports/analysis-content-resolver";
import { ANALYSIS_DISPATCHER } from "./application/ports/analysis-dispatcher";
import { ANALYSIS_JOB_REPOSITORY } from "./application/ports/analysis-job.repository";
import { BUSINESS_ANALYSIS_REPOSITORY } from "./application/ports/business-analysis.repository";
import { PROMPT_TEMPLATE } from "./application/ports/prompt-template.port";

import { CancelAnalysisUseCase } from "./application/use-cases/cancel-analysis.use-case";
import { GetAnalysisCapabilitiesUseCase } from "./application/use-cases/get-analysis-capabilities.use-case";
import { GetAnalysisUseCase } from "./application/use-cases/get-analysis.use-case";
import { GetTenderBusinessAnalysisUseCase } from "./application/use-cases/get-tender-business-analysis.use-case";
import { ListTenderAnalysesUseCase } from "./application/use-cases/list-tender-analyses.use-case";
import { ListTenderClausesUseCase } from "./application/use-cases/list-tender-clauses.use-case";
import { ListTenderCriteriaUseCase } from "./application/use-cases/list-tender-criteria.use-case";
import { ListTenderDeadlinesUseCase } from "./application/use-cases/list-tender-deadlines.use-case";
import { ListTenderQuestionsUseCase } from "./application/use-cases/list-tender-questions.use-case";
import { ListTenderRequirementsUseCase } from "./application/use-cases/list-tender-requirements.use-case";
import { ListTenderRisksUseCase } from "./application/use-cases/list-tender-risks.use-case";
import { ProcessAnalysisJobUseCase } from "./application/use-cases/process-analysis-job.use-case";
import { RetryAnalysisUseCase } from "./application/use-cases/retry-analysis.use-case";
import { StartDocumentAnalysisUseCase } from "./application/use-cases/start-document-analysis.use-case";
import { StartTenderAnalysisUseCase } from "./application/use-cases/start-tender-analysis.use-case";

import { ANALYSIS_CONFIG, loadAnalysisConfig } from "./infrastructure/analysis-config";
import { DefaultAIProviderRegistry } from "./infrastructure/ai-provider.registry";
import { BusinessAnalysisContentResolver } from "./infrastructure/business-analysis-content-resolver";
import { InProcessAnalysisDispatcher } from "./infrastructure/in-process-analysis.dispatcher";
import { PrismaAnalysisAttemptRepository } from "./infrastructure/prisma-analysis-attempt.repository";
import { PrismaAnalysisJobRepository } from "./infrastructure/prisma-analysis-job.repository";
import { PrismaAuditLogWriter } from "./infrastructure/prisma-audit-log.writer";
import { PrismaBusinessAnalysisRepository } from "./infrastructure/prisma-business-analysis.repository";
import { StaticPromptTemplateProvider } from "./infrastructure/static-prompt-template.provider";

import { AnalysisController } from "./interfaces/http/analysis.controller";

@Module({
  imports: [IdentityModule, MembershipsModule, TendersModule, ExtractionModule],
  controllers: [AnalysisController],
  providers: [
    StartTenderAnalysisUseCase,
    StartDocumentAnalysisUseCase,
    GetAnalysisUseCase,
    GetAnalysisCapabilitiesUseCase,
    RetryAnalysisUseCase,
    CancelAnalysisUseCase,
    ProcessAnalysisJobUseCase,
    ListTenderAnalysesUseCase,
    GetTenderBusinessAnalysisUseCase,
    ListTenderDeadlinesUseCase,
    ListTenderCriteriaUseCase,
    ListTenderClausesUseCase,
    ListTenderRequirementsUseCase,
    ListTenderRisksUseCase,
    ListTenderQuestionsUseCase,

    { provide: ANALYSIS_JOB_REPOSITORY, useClass: PrismaAnalysisJobRepository },
    { provide: ANALYSIS_ATTEMPT_REPOSITORY, useClass: PrismaAnalysisAttemptRepository },
    { provide: BUSINESS_ANALYSIS_REPOSITORY, useClass: PrismaBusinessAnalysisRepository },
    { provide: ANALYSIS_CONTENT_RESOLVER, useClass: BusinessAnalysisContentResolver },
    { provide: AUDIT_LOG_WRITER, useClass: PrismaAuditLogWriter },
    { provide: ANALYSIS_DISPATCHER, useClass: InProcessAnalysisDispatcher },
    { provide: AI_PROVIDER_REGISTRY, useClass: DefaultAIProviderRegistry },
    { provide: PROMPT_TEMPLATE, useClass: StaticPromptTemplateProvider },
    // Mission Sprint 4.1 §"Configuration" — contrairement à EXTRACTION_CONFIG, cette factory ne
    // peut jamais faire échouer NestFactory.create(...) : AUCUNE variable IA n'est obligatoire au
    // démarrage (voir loadAnalysisConfig — l'absence de clé/provider ne devient une erreur
    // qu'au moment de démarrer une analyse réelle, AI_PROVIDER_NOT_CONFIGURED).
    { provide: ANALYSIS_CONFIG, useFactory: () => loadAnalysisConfig() },
  ],
  // AI_PROVIDER_REGISTRY/PROMPT_TEMPLATE exportés pour le module ai-benchmark (Sprint 5.2) —
  // réutilise le port et l'adapter existants pour exécuter des benchmarks avec le MÊME prompt que
  // la production, jamais un second chemin d'appel provider ou une réimplémentation de prompt.
  // Les 7 use cases de lecture ci-dessous sont exportés pour Generation (Sprint 6), qui a besoin
  // des constats d'analyse réels (exigences/critères/risques/échéances/clauses/questions) pour
  // construire son contexte de génération — jamais une seconde lecture directe de ces tables.
  exports: [
    AI_PROVIDER_REGISTRY,
    PROMPT_TEMPLATE,
    GetTenderBusinessAnalysisUseCase,
    ListTenderCriteriaUseCase,
    ListTenderRequirementsUseCase,
    ListTenderRisksUseCase,
    ListTenderDeadlinesUseCase,
    ListTenderClausesUseCase,
    ListTenderQuestionsUseCase,
  ],
})
export class AnalysisModule {}
