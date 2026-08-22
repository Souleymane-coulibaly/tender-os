import { Module } from "@nestjs/common";
import { AiRoutingModule } from "../ai-routing";
import { AnalysisModule } from "../analysis";
import { ClientPortfolioModule } from "../client-portfolio";
import { IdentityModule } from "../identity";
import { KnowledgeBaseModule } from "../knowledge-base";
import { MembershipsModule } from "../memberships";
import { TendersModule } from "../tenders";
import { AUDIT_LOG_WRITER } from "./application/ports/audit-log-writer";
import { GENERATION_DISPATCHER } from "./application/ports/generation-dispatcher";
import { GENERATION_REPOSITORY } from "./application/ports/generation.repository";
import { PROMPT_RENDERER } from "./application/ports/prompt-renderer";
import { PROMPT_TEMPLATE_REPOSITORY } from "./application/ports/prompt-template.repository";
import { PROMPT_VERSION_REPOSITORY } from "./application/ports/prompt-version.repository";
import { ActivatePromptVersionUseCase } from "./application/use-cases/activate-prompt-version.use-case";
import { ArchivePromptTemplateUseCase } from "./application/use-cases/archive-prompt-template.use-case";
import { CancelGenerationUseCase } from "./application/use-cases/cancel-generation.use-case";
import { CompareGenerationVersionsUseCase } from "./application/use-cases/compare-generation-versions.use-case";
import { CreatePromptTemplateUseCase } from "./application/use-cases/create-prompt-template.use-case";
import { CreatePromptVersionUseCase } from "./application/use-cases/create-prompt-version.use-case";
import { EditGenerationUseCase } from "./application/use-cases/edit-generation.use-case";
import { GetGenerationCapabilitiesUseCase } from "./application/use-cases/get-generation-capabilities.use-case";
import { GetGenerationUseCase } from "./application/use-cases/get-generation.use-case";
import { GetPromptTemplateUseCase } from "./application/use-cases/get-prompt-template.use-case";
import { LaunchGenerationUseCase } from "./application/use-cases/launch-generation.use-case";
import { ListGenerationVersionsUseCase } from "./application/use-cases/list-generation-versions.use-case";
import { ListPromptTemplatesUseCase } from "./application/use-cases/list-prompt-templates.use-case";
import { ListTenderGenerationsUseCase } from "./application/use-cases/list-tender-generations.use-case";
import { ProcessGenerationUseCase } from "./application/use-cases/process-generation.use-case";
import { ReclaimStaleGenerationsUseCase } from "./application/use-cases/reclaim-stale-generations.use-case";
import { RegenerateGenerationUseCase } from "./application/use-cases/regenerate-generation.use-case";
import { RejectGenerationUseCase } from "./application/use-cases/reject-generation.use-case";
import { RetryGenerationUseCase } from "./application/use-cases/retry-generation.use-case";
import { ValidateGenerationUseCase } from "./application/use-cases/validate-generation.use-case";
import { GenerationContextBuilder } from "./application/services/generation-context-builder";
import { GENERATION_CONFIG, loadGenerationConfig } from "./infrastructure/generation-config";
import { GenerationStaleRecoveryWorker } from "./infrastructure/generation-stale-recovery.worker";
import { InProcessGenerationDispatcher } from "./infrastructure/in-process-generation.dispatcher";
import { PrismaAuditLogWriter } from "./infrastructure/prisma-audit-log.writer";
import { PrismaGenerationRepository } from "./infrastructure/prisma-generation.repository";
import { PrismaPromptTemplateRepository } from "./infrastructure/prisma-prompt-template.repository";
import { PrismaPromptVersionRepository } from "./infrastructure/prisma-prompt-version.repository";
import { SimplePlaceholderPromptRenderer } from "./infrastructure/simple-placeholder-prompt.renderer";
import { GenerationController } from "./interfaces/http/generation.controller";
import { PromptTemplatesController } from "./interfaces/http/prompt-templates.controller";

/**
 * Module Generation (Sprint 6) — importe `AnalysisModule`/`TendersModule`/`ClientPortfolioModule`/
 * `KnowledgeBaseModule` dans UN SEUL sens (réutilise `AI_PROVIDER_REGISTRY`/`EscalationCondition`/
 * les 7 use cases de lecture d'Analysis, `GetTenderUseCase`, `AssertClientAccessUseCase`/
 * `GetClientAccountUseCase`, `SearchKnowledgeBaseUseCase`) : aucun de ces modules n'importe jamais
 * Generation en retour, évitant tout cycle Nest (même motif qu'ai-benchmark → analysis, Sprint 5.2).
 * L'écriture de la `RoutingDecision` (`GENERATION_ROUTING_DECISION_WRITER`, token propre à
 * Generation) passe par le pont `@Global()` `RoutingPolicyBridgeModule` (ai-benchmark, importé par
 * `AppModule`). Checkpoint TENDEROS-2.1-P2.3-E4.1 — la sélection du MODÈLE, elle, passe
 * exclusivement par `AiModelRouter` (`AiRoutingModule`, importé ci-dessus) : `RoutingPolicy`
 * (correctif Sprint 6, audit Codex P1-1/P1-2) ne court-circuite plus jamais ce choix.
 * `ProcessGenerationUseCase` échoue explicitement (`AiModelRouterUnavailableError`) UNIQUEMENT si
 * `AiRoutingModule` lui-même n'est pas câblé, jamais un repli silencieux sur un modèle codé en dur.
 */
@Module({
  imports: [IdentityModule, MembershipsModule, TendersModule, ClientPortfolioModule, KnowledgeBaseModule, AnalysisModule, AiRoutingModule],
  controllers: [GenerationController, PromptTemplatesController],
  providers: [
    CreatePromptTemplateUseCase,
    CreatePromptVersionUseCase,
    ActivatePromptVersionUseCase,
    ArchivePromptTemplateUseCase,
    GetPromptTemplateUseCase,
    ListPromptTemplatesUseCase,

    LaunchGenerationUseCase,
    ProcessGenerationUseCase,
    RetryGenerationUseCase,
    RegenerateGenerationUseCase,
    CancelGenerationUseCase,
    EditGenerationUseCase,
    ValidateGenerationUseCase,
    RejectGenerationUseCase,
    GetGenerationUseCase,
    GetGenerationCapabilitiesUseCase,
    ListGenerationVersionsUseCase,
    ListTenderGenerationsUseCase,
    CompareGenerationVersionsUseCase,
    ReclaimStaleGenerationsUseCase,
    GenerationStaleRecoveryWorker,

    GenerationContextBuilder,

    { provide: PROMPT_TEMPLATE_REPOSITORY, useClass: PrismaPromptTemplateRepository },
    { provide: PROMPT_VERSION_REPOSITORY, useClass: PrismaPromptVersionRepository },
    { provide: GENERATION_REPOSITORY, useClass: PrismaGenerationRepository },
    { provide: PROMPT_RENDERER, useClass: SimplePlaceholderPromptRenderer },
    { provide: GENERATION_DISPATCHER, useClass: InProcessGenerationDispatcher },
    { provide: AUDIT_LOG_WRITER, useClass: PrismaAuditLogWriter },
    // Mission §"Configuration" — jamais une variable obligatoire au démarrage, même motif que
    // ANALYSIS_CONFIG/AI_BENCHMARK_CONFIG.
    { provide: GENERATION_CONFIG, useFactory: () => loadGenerationConfig() },
  ],
  // Réexportés pour permettre au module Export (Sprint 8A) de lire les générations RÉELLEMENT
  // validées d'un Tender avant assemblage documentaire — jamais une seconde lecture directe de la
  // table `generations` (même motif que le réexport de `GetTenderUseCase` par Tenders pour
  // Documents/Pricing). Ces use cases restent RBAC-gated (`ClientPermission.ReadGeneration`) :
  // Export ne contourne rien, il consomme le même chemin qu'un acteur humain.
  // `LaunchGenerationUseCase` réexporté en plus pour Sprint 8A.1 (Deliverables) — déclencher la
  // génération IA d'une section de Mémoire technique en réutilisant CE moteur tel quel.
  exports: [GetGenerationUseCase, ListTenderGenerationsUseCase, ListGenerationVersionsUseCase, LaunchGenerationUseCase],
})
export class GenerationModule {}
