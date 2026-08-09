import { Module } from "@nestjs/common";
import { AiSuggestionModule } from "../ai-suggestion";
import { AnalysisModule } from "../analysis";
import { ClientPortfolioModule } from "../client-portfolio";
import { CompanyProfileModule } from "../company-profile";
import { DceModule } from "../dce";
import { IdentityModule } from "../identity";
import { MembershipsModule } from "../memberships";
import { OutboxModule } from "../outbox";
import { TendersModule } from "../tenders";
import { ATOMIC_TRANSACTION_RUNNER } from "./application/ports/atomic-transaction-runner";
import { AUDIT_LOG_WRITER } from "./application/ports/audit-log-writer";
import { GO_NO_GO_DECISION_REPOSITORY } from "./application/ports/go-no-go-decision.repository";
import { GO_NO_GO_REPORT_REPOSITORY } from "./application/ports/go-no-go-report.repository";
import { OPPORTUNITY_QUICK_SCORE_REPOSITORY } from "./application/ports/opportunity-quick-score.repository";
import { OPPORTUNITY_REPOSITORY } from "./application/ports/opportunity.repository";
import { ArchiveOpportunityUseCase } from "./application/use-cases/archive-opportunity.use-case";
import { ChangeOpportunityStatusUseCase } from "./application/use-cases/change-opportunity-status.use-case";
import { ComputeOpportunityQuickScoreUseCase } from "./application/use-cases/compute-opportunity-quick-score.use-case";
import { CreateOpportunityUseCase } from "./application/use-cases/create-opportunity.use-case";
import { GenerateGoNoGoReportUseCase } from "./application/use-cases/generate-go-no-go-report.use-case";
import { GetGoNoGoReportUseCase } from "./application/use-cases/get-go-no-go-report.use-case";
import { GetOpportunityUseCase } from "./application/use-cases/get-opportunity.use-case";
import { GetOpportunityQuickScoreUseCase } from "./application/use-cases/get-opportunity-quick-score.use-case";
import { ListGoNoGoReportsUseCase } from "./application/use-cases/list-go-no-go-reports.use-case";
import { ListOpportunitiesUseCase } from "./application/use-cases/list-opportunities.use-case";
import { ListOpportunityGoNoGoDecisionsUseCase } from "./application/use-cases/list-opportunity-go-no-go-decisions.use-case";
import { ListOpportunityQuickScoresUseCase } from "./application/use-cases/list-opportunity-quick-scores.use-case";
import { ListTenderGoNoGoDecisionsUseCase } from "./application/use-cases/list-tender-go-no-go-decisions.use-case";
import { PromoteOpportunityToTenderUseCase } from "./application/use-cases/promote-opportunity-to-tender.use-case";
import { RecordOpportunityGoNoGoDecisionUseCase } from "./application/use-cases/record-opportunity-go-no-go-decision.use-case";
import { RecordTenderGoNoGoDecisionUseCase } from "./application/use-cases/record-tender-go-no-go-decision.use-case";
import { RestoreOpportunityUseCase } from "./application/use-cases/restore-opportunity.use-case";
import { UpdateOpportunityUseCase } from "./application/use-cases/update-opportunity.use-case";
import { PrismaAtomicTransactionRunner } from "./infrastructure/prisma-atomic-transaction-runner";
import { PrismaAuditLogWriter } from "./infrastructure/prisma-audit-log.writer";
import { PrismaGoNoGoDecisionRepository } from "./infrastructure/prisma-go-no-go-decision.repository";
import { PrismaGoNoGoReportRepository } from "./infrastructure/prisma-go-no-go-report.repository";
import { PrismaOpportunityQuickScoreRepository } from "./infrastructure/prisma-opportunity-quick-score.repository";
import { PrismaOpportunityRepository } from "./infrastructure/prisma-opportunity.repository";
import { GoNoGoController } from "./interfaces/http/go-no-go.controller";
import { OpportunitiesController } from "./interfaces/http/opportunities.controller";

/**
 * Module Sprint 5 (GO/NO-GO IA) — nouveau bounded context qui orchestre des lectures cross-module
 * (Tenders/Analysis/AiSuggestion/CompanyProfile/Dce) sans jamais vivre dans aucun d'eux, même motif
 * que `ai-suggestion-bridge` (voir le plan Sprint 5, décision d'architecture §1).
 */
@Module({
  imports: [IdentityModule, MembershipsModule, ClientPortfolioModule, TendersModule, AnalysisModule, AiSuggestionModule, CompanyProfileModule, DceModule, OutboxModule],
  controllers: [OpportunitiesController, GoNoGoController],
  providers: [
    CreateOpportunityUseCase,
    GetOpportunityUseCase,
    ListOpportunitiesUseCase,
    UpdateOpportunityUseCase,
    ChangeOpportunityStatusUseCase,
    ArchiveOpportunityUseCase,
    RestoreOpportunityUseCase,

    ComputeOpportunityQuickScoreUseCase,
    GetOpportunityQuickScoreUseCase,
    ListOpportunityQuickScoresUseCase,

    GenerateGoNoGoReportUseCase,
    GetGoNoGoReportUseCase,
    ListGoNoGoReportsUseCase,

    RecordOpportunityGoNoGoDecisionUseCase,
    RecordTenderGoNoGoDecisionUseCase,
    ListOpportunityGoNoGoDecisionsUseCase,
    ListTenderGoNoGoDecisionsUseCase,

    PromoteOpportunityToTenderUseCase,

    { provide: OPPORTUNITY_REPOSITORY, useClass: PrismaOpportunityRepository },
    { provide: AUDIT_LOG_WRITER, useClass: PrismaAuditLogWriter },
    { provide: OPPORTUNITY_QUICK_SCORE_REPOSITORY, useClass: PrismaOpportunityQuickScoreRepository },
    { provide: GO_NO_GO_REPORT_REPOSITORY, useClass: PrismaGoNoGoReportRepository },
    { provide: GO_NO_GO_DECISION_REPOSITORY, useClass: PrismaGoNoGoDecisionRepository },
    { provide: ATOMIC_TRANSACTION_RUNNER, useClass: PrismaAtomicTransactionRunner },
  ],
  // V2 Sprint 9 (Chat IA conversationnel) — réexporté UNIQUEMENT pour `chat` : le dernier GO/NO-GO
  // d'un Tender fait partie de la hiérarchie des sources structurées (mission §18), jamais
  // recalculé par le Chat lui-même. Reste RBAC-gated (`ClientPermission.ReadGoNoGo`) : Chat ne
  // contourne rien, il consomme le même chemin qu'un acteur humain.
  exports: [GetGoNoGoReportUseCase],
})
export class OpportunityModule {}
