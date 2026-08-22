import { Module } from "@nestjs/common";
import { AiRoutingModule } from "../ai-routing";
import { AnalysisModule } from "../analysis";
import { ClientPortfolioModule } from "../client-portfolio";
import { IdentityModule } from "../identity";
import { KnowledgeBaseModule } from "../knowledge-base";
import { MembershipsModule } from "../memberships";
import { OpportunityModule } from "../opportunity";
import { OutboxWriterModule } from "../outbox";
import { TendersModule } from "../tenders";
import { ArchiveConversationUseCase } from "./application/use-cases/archive-conversation.use-case";
import { CountTodayChatUsageForOrganizationUseCase } from "./application/use-cases/count-today-chat-usage-for-organization.use-case";
import { CreateConversationUseCase } from "./application/use-cases/create-conversation.use-case";
import { GetConversationUseCase } from "./application/use-cases/get-conversation.use-case";
import { ListConversationsUseCase } from "./application/use-cases/list-conversations.use-case";
import { ListMessagesUseCase } from "./application/use-cases/list-messages.use-case";
import { ReclaimStalePendingMessagesUseCase } from "./application/use-cases/reclaim-stale-pending-messages.use-case";
import { SendMessageUseCase } from "./application/use-cases/send-message.use-case";
import { ATOMIC_TRANSACTION_RUNNER } from "./application/ports/atomic-transaction-runner";
import { AUDIT_LOG_WRITER } from "./application/ports/audit-log-writer";
import { CONVERSATION_REPOSITORY } from "./application/ports/conversation.repository";
import { DCE_CHUNK_SEARCH_PROVIDER } from "./application/ports/dce-chunk-search-provider";
import { MESSAGE_REPOSITORY } from "./application/ports/message.repository";
import { ChatContextAssembler } from "./application/services/chat-context-assembler";
import { ChatStalePendingRecoveryWorker } from "./infrastructure/chat-stale-pending-recovery.worker";
import { CHAT_CONFIG, loadChatConfig } from "./infrastructure/chat-config";
import { PrismaAtomicTransactionRunner } from "./infrastructure/prisma-atomic-transaction-runner";
import { PrismaAuditLogWriter } from "./infrastructure/prisma-audit-log.writer";
import { PrismaConversationRepository } from "./infrastructure/prisma-conversation.repository";
import { PrismaIlikeDceChunkSearchProvider } from "./infrastructure/prisma-ilike-dce-chunk-search.provider";
import { PrismaMessageRepository } from "./infrastructure/prisma-message.repository";
import { ChatController } from "./interfaces/http/chat.controller";

/**
 * Module Chat (V2 Sprint 9) — importe `AnalysisModule`/`TendersModule`/`ClientPortfolioModule`/
 * `KnowledgeBaseModule`/`OpportunityModule` dans UN SEUL sens (réutilise `AI_PROVIDER_REGISTRY`,
 * `GetTenderUseCase`, les 6 use cases de lecture des Findings, `GetEffectiveTenderAnalysisSummary
 * UseCase`, `AssertClientAccessUseCase`, `SearchKnowledgeBaseUseCase`, `GetGoNoGoReportUseCase`,
 * les repositories Lot/Criterion/RequestedDocument/Milestone/Risk/ChecklistItem) — même motif que
 * `GenerationModule`. Aucun de ces modules n'importe jamais Chat en retour, évitant tout cycle Nest.
 * Read-only sur les données métier ce sprint (mission §"aucune action IA autonome") : aucune
 * dépendance vers Workspace/Generation/Export.
 */
@Module({
  imports: [IdentityModule, MembershipsModule, TendersModule, ClientPortfolioModule, KnowledgeBaseModule, AnalysisModule, OpportunityModule, OutboxWriterModule, AiRoutingModule],
  controllers: [ChatController],
  providers: [
    CreateConversationUseCase,
    GetConversationUseCase,
    ListConversationsUseCase,
    ArchiveConversationUseCase,
    ListMessagesUseCase,
    SendMessageUseCase,
    ReclaimStalePendingMessagesUseCase,
    ChatStalePendingRecoveryWorker,
    CountTodayChatUsageForOrganizationUseCase,

    ChatContextAssembler,

    { provide: CONVERSATION_REPOSITORY, useClass: PrismaConversationRepository },
    { provide: MESSAGE_REPOSITORY, useClass: PrismaMessageRepository },
    { provide: DCE_CHUNK_SEARCH_PROVIDER, useClass: PrismaIlikeDceChunkSearchProvider },
    { provide: AUDIT_LOG_WRITER, useClass: PrismaAuditLogWriter },
    { provide: ATOMIC_TRANSACTION_RUNNER, useClass: PrismaAtomicTransactionRunner },
    // Mission §"Configuration" — jamais une variable obligatoire au démarrage, même motif que
    // ANALYSIS_CONFIG/GENERATION_CONFIG.
    { provide: CHAT_CONFIG, useFactory: () => loadChatConfig() },
  ],
  // V2 Sprint 22 (billing, étape 22D) — `CountTodayChatUsageForOrganizationUseCase` réexporté en
  // LECTURE SEULE pour que `billing` mesure l'usage "Chat IA" organisation-wide (écran Abonnement &
  // utilisation, Platform Admin, résumé Dashboard 22E) — même motif que les use cases "for-dashboard"
  // déjà réexportés par Tenders/ResponsePackage/Opportunity/Workspace (Sprint 15).
  exports: [CountTodayChatUsageForOrganizationUseCase],
})
export class ChatModule {}
