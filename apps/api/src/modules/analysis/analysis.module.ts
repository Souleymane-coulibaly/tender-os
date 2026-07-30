import { Module } from "@nestjs/common";
import { ExtractionModule } from "../extraction";
import { IdentityModule } from "../identity";
import { MembershipsModule } from "../memberships";
import { TendersModule } from "../tenders";

import { AUDIT_LOG_WRITER } from "./application/ports/audit-log-writer";
import { AI_PROVIDER_REGISTRY } from "./application/ports/ai-provider-registry";
import { ANALYSIS_ATTEMPT_REPOSITORY } from "./application/ports/analysis-attempt.repository";
import { ANALYSIS_DISPATCHER } from "./application/ports/analysis-dispatcher";
import { ANALYSIS_JOB_REPOSITORY } from "./application/ports/analysis-job.repository";
import { PROMPT_TEMPLATE } from "./application/ports/prompt-template.port";

import { CancelAnalysisUseCase } from "./application/use-cases/cancel-analysis.use-case";
import { GetAnalysisUseCase } from "./application/use-cases/get-analysis.use-case";
import { ProcessAnalysisJobUseCase } from "./application/use-cases/process-analysis-job.use-case";
import { RetryAnalysisUseCase } from "./application/use-cases/retry-analysis.use-case";
import { StartDocumentAnalysisUseCase } from "./application/use-cases/start-document-analysis.use-case";
import { StartTenderAnalysisUseCase } from "./application/use-cases/start-tender-analysis.use-case";

import { ANALYSIS_CONFIG, loadAnalysisConfig } from "./infrastructure/analysis-config";
import { DefaultAIProviderRegistry } from "./infrastructure/ai-provider.registry";
import { InProcessAnalysisDispatcher } from "./infrastructure/in-process-analysis.dispatcher";
import { PrismaAnalysisAttemptRepository } from "./infrastructure/prisma-analysis-attempt.repository";
import { PrismaAnalysisJobRepository } from "./infrastructure/prisma-analysis-job.repository";
import { PrismaAuditLogWriter } from "./infrastructure/prisma-audit-log.writer";
import { StaticPromptTemplateProvider } from "./infrastructure/static-prompt-template.provider";

import { AnalysisController } from "./interfaces/http/analysis.controller";

@Module({
  imports: [IdentityModule, MembershipsModule, TendersModule, ExtractionModule],
  controllers: [AnalysisController],
  providers: [
    StartTenderAnalysisUseCase,
    StartDocumentAnalysisUseCase,
    GetAnalysisUseCase,
    RetryAnalysisUseCase,
    CancelAnalysisUseCase,
    ProcessAnalysisJobUseCase,

    { provide: ANALYSIS_JOB_REPOSITORY, useClass: PrismaAnalysisJobRepository },
    { provide: ANALYSIS_ATTEMPT_REPOSITORY, useClass: PrismaAnalysisAttemptRepository },
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
})
export class AnalysisModule {}
