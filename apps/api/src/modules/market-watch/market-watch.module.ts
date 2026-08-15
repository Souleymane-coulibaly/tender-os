import { Module } from "@nestjs/common";
import { ClientPortfolioModule } from "../client-portfolio";
import { IdentityModule } from "../identity";
import { MembershipsModule } from "../memberships";
import { NotificationsModule } from "../notifications";
import { OpportunityModule } from "../opportunity";
import { OutboxWriterModule } from "../outbox";
import { ATOMIC_TRANSACTION_RUNNER } from "./application/ports/atomic-transaction-runner";
import { AUDIT_LOG_WRITER } from "./application/ports/audit-log-writer";
import { EXTERNAL_TENDER_REPOSITORY } from "./application/ports/external-tender.repository";
import { EXTERNAL_TENDER_PROMOTION_REPOSITORY } from "./application/ports/external-tender-promotion.repository";
import { MARKET_SOURCE_CONNECTORS } from "./application/ports/market-source-connector";
import { MARKET_SOURCE_SYNC_LEASE_REPOSITORY } from "./application/ports/market-source-sync-lease.repository";
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
import { MarketSourceSyncWorker } from "./infrastructure/market-source-sync.worker";
import { PrismaAtomicTransactionRunner } from "./infrastructure/prisma-atomic-transaction-runner";
import { PrismaAuditLogWriter } from "./infrastructure/prisma-audit-log.writer";
import { PrismaExternalTenderRepository } from "./infrastructure/prisma-external-tender.repository";
import { PrismaExternalTenderPromotionRepository } from "./infrastructure/prisma-external-tender-promotion.repository";
import { PrismaMarketSourceSyncLeaseRepository } from "./infrastructure/prisma-market-source-sync-lease.repository";
import { PrismaSavedSearchRepository } from "./infrastructure/prisma-saved-search.repository";
import { PrismaSavedSearchMatchRepository } from "./infrastructure/prisma-saved-search-match.repository";
import { ExternalTendersController } from "./interfaces/http/external-tenders.controller";
import { SavedSearchesController } from "./interfaces/http/saved-searches.controller";

/**
 * V2 Sprint 17 (Veille & détection des marchés) — module autonome, importe `OutboxWriterModule`
 * (jamais `OutboxModule` complet, même motif que tous les producteurs depuis le correctif Sprint
 * 16). `BoampSourceConnector` est le seul connecteur réel enregistré ce sprint (mission §5) ;
 * `MARKET_SOURCE_CONNECTORS` reste un tableau pour permettre d'en ajouter d'autres sans toucher au
 * worker. `NotificationsModule` reste importé pour `CreateNotificationUseCase` (notifications
 * in-app sur un match) — `EMAIL_PROVIDER`, lui, a déménagé vers `shared-kernel` au V2 Sprint 24
 * (voir shared-kernel/email-provider.ts) et est désormais disponible partout via
 * `SharedKernelModule` (`@Global()`), sans plus jamais transiter par `NotificationsModule`.
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

    { provide: EXTERNAL_TENDER_REPOSITORY, useClass: PrismaExternalTenderRepository },
    { provide: SAVED_SEARCH_REPOSITORY, useClass: PrismaSavedSearchRepository },
    { provide: SAVED_SEARCH_MATCH_REPOSITORY, useClass: PrismaSavedSearchMatchRepository },
    { provide: EXTERNAL_TENDER_PROMOTION_REPOSITORY, useClass: PrismaExternalTenderPromotionRepository },
    { provide: MARKET_SOURCE_SYNC_LEASE_REPOSITORY, useClass: PrismaMarketSourceSyncLeaseRepository },
    { provide: AUDIT_LOG_WRITER, useClass: PrismaAuditLogWriter },
    { provide: ATOMIC_TRANSACTION_RUNNER, useClass: PrismaAtomicTransactionRunner },
  ],
  exports: [],
})
export class MarketWatchModule {}
