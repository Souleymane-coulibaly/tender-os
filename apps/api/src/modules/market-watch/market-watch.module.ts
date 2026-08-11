import { Module } from "@nestjs/common";
import { ClientPortfolioModule } from "../client-portfolio";
import { IdentityModule } from "../identity";
import { MembershipsModule } from "../memberships";
import { NotificationsModule } from "../notifications";
import { OpportunityModule } from "../opportunity";
import { OutboxWriterModule } from "../outbox";
import { ATOMIC_TRANSACTION_RUNNER } from "./application/ports/atomic-transaction-runner";
import { AUDIT_LOG_WRITER } from "./application/ports/audit-log-writer";
import { EMAIL_PROVIDER } from "./application/ports/email-provider";
import { EXTERNAL_TENDER_REPOSITORY } from "./application/ports/external-tender.repository";
import { EXTERNAL_TENDER_PROMOTION_REPOSITORY } from "./application/ports/external-tender-promotion.repository";
import { MARKET_SOURCE_CONNECTORS } from "./application/ports/market-source-connector";
import { SAVED_SEARCH_REPOSITORY } from "./application/ports/saved-search.repository";
import { SAVED_SEARCH_MATCH_REPOSITORY } from "./application/ports/saved-search-match.repository";
import { CreateSavedSearchUseCase } from "./application/use-cases/create-saved-search.use-case";
import { DeleteSavedSearchUseCase } from "./application/use-cases/delete-saved-search.use-case";
import { GetExternalTenderUseCase } from "./application/use-cases/get-external-tender.use-case";
import { GetSavedSearchUseCase } from "./application/use-cases/get-saved-search.use-case";
import { ListSavedSearchesUseCase } from "./application/use-cases/list-saved-searches.use-case";
import { ListSavedSearchMatchesUseCase } from "./application/use-cases/list-saved-search-matches.use-case";
import { PromoteExternalTenderToOpportunityUseCase } from "./application/use-cases/promote-external-tender-to-opportunity.use-case";
import { SendPendingEmailAlertsUseCase } from "./application/use-cases/send-pending-email-alerts.use-case";
import { SetMatchStatusUseCase } from "./application/use-cases/set-match-status.use-case";
import { SetSavedSearchStatusUseCase } from "./application/use-cases/set-saved-search-status.use-case";
import { SyncMarketSourceUseCase } from "./application/use-cases/sync-market-source.use-case";
import { UpdateSavedSearchUseCase } from "./application/use-cases/update-saved-search.use-case";
import { BoampSourceConnector } from "./infrastructure/connectors/boamp-source-connector";
import { EmailAlertWorker } from "./infrastructure/email-alert.worker";
import { LoggingEmailProvider } from "./infrastructure/email/logging-email.provider";
import { ResendEmailProvider } from "./infrastructure/email/resend-email.provider";
import { MarketSourceSyncWorker } from "./infrastructure/market-source-sync.worker";
import { PrismaAtomicTransactionRunner } from "./infrastructure/prisma-atomic-transaction-runner";
import { PrismaAuditLogWriter } from "./infrastructure/prisma-audit-log.writer";
import { PrismaExternalTenderRepository } from "./infrastructure/prisma-external-tender.repository";
import { PrismaExternalTenderPromotionRepository } from "./infrastructure/prisma-external-tender-promotion.repository";
import { PrismaSavedSearchRepository } from "./infrastructure/prisma-saved-search.repository";
import { PrismaSavedSearchMatchRepository } from "./infrastructure/prisma-saved-search-match.repository";
import { ExternalTendersController } from "./interfaces/http/external-tenders.controller";
import { SavedSearchesController } from "./interfaces/http/saved-searches.controller";

/**
 * V2 Sprint 17 (Veille & détection des marchés) — module autonome, importe `OutboxWriterModule`
 * (jamais `OutboxModule` complet, même motif que tous les producteurs depuis le correctif Sprint
 * 16). `EMAIL_PROVIDER` bascule sur `ResendEmailProvider` UNIQUEMENT si `RESEND_API_KEY` est
 * réellement présente au démarrage (mission §42) — sinon `LoggingEmailProvider` (jamais un échec
 * silencieux, jamais une exigence de secret de production pour que le Sprint fonctionne, mission
 * §41). `BoampSourceConnector` est le seul connecteur réel enregistré ce sprint (mission §5) ;
 * `MARKET_SOURCE_CONNECTORS` reste un tableau pour permettre d'en ajouter d'autres sans toucher au
 * worker.
 */
@Module({
  imports: [IdentityModule, MembershipsModule, ClientPortfolioModule, OpportunityModule, NotificationsModule, OutboxWriterModule],
  controllers: [SavedSearchesController, ExternalTendersController],
  providers: [
    CreateSavedSearchUseCase,
    UpdateSavedSearchUseCase,
    SetSavedSearchStatusUseCase,
    DeleteSavedSearchUseCase,
    ListSavedSearchesUseCase,
    GetSavedSearchUseCase,
    ListSavedSearchMatchesUseCase,
    SetMatchStatusUseCase,
    GetExternalTenderUseCase,
    PromoteExternalTenderToOpportunityUseCase,
    SyncMarketSourceUseCase,
    SendPendingEmailAlertsUseCase,

    MarketSourceSyncWorker,
    EmailAlertWorker,

    BoampSourceConnector,
    { provide: MARKET_SOURCE_CONNECTORS, useFactory: (boamp: BoampSourceConnector) => [boamp], inject: [BoampSourceConnector] },

    LoggingEmailProvider,
    ResendEmailProvider,
    { provide: EMAIL_PROVIDER, useClass: process.env.RESEND_API_KEY ? ResendEmailProvider : LoggingEmailProvider },

    { provide: EXTERNAL_TENDER_REPOSITORY, useClass: PrismaExternalTenderRepository },
    { provide: SAVED_SEARCH_REPOSITORY, useClass: PrismaSavedSearchRepository },
    { provide: SAVED_SEARCH_MATCH_REPOSITORY, useClass: PrismaSavedSearchMatchRepository },
    { provide: EXTERNAL_TENDER_PROMOTION_REPOSITORY, useClass: PrismaExternalTenderPromotionRepository },
    { provide: AUDIT_LOG_WRITER, useClass: PrismaAuditLogWriter },
    { provide: ATOMIC_TRANSACTION_RUNNER, useClass: PrismaAtomicTransactionRunner },
  ],
  exports: [],
})
export class MarketWatchModule {}
