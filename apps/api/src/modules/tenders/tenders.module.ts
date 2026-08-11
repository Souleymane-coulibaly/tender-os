import { Module } from "@nestjs/common";
import { ClientPortfolioModule } from "../client-portfolio";
import { IdentityModule } from "../identity";
import { MembershipsModule } from "../memberships";
import { OutboxModule } from "../outbox";
import { AUDIT_LOG_WRITER } from "./application/ports/audit-log-writer";
import { ALERT_REPOSITORY } from "./application/ports/alert.repository";
import { AWARD_CRITERION_REPOSITORY } from "./application/ports/award-criterion.repository";
import { BUYER_REPOSITORY } from "./application/ports/buyer.repository";
import { CHECKLIST_ITEM_REPOSITORY } from "./application/ports/checklist-item.repository";
import { CHECKLIST_ITEM_SOURCE_REPOSITORY } from "./application/ports/checklist-item-source.repository";
import { MILESTONE_REPOSITORY } from "./application/ports/milestone.repository";
import { REQUESTED_DOCUMENT_REPOSITORY } from "./application/ports/requested-document.repository";
import { RISK_REPOSITORY } from "./application/ports/risk.repository";
import { TENDER_SEARCH_PROVIDER } from "./application/ports/tender-search-provider";
import { TENDER_LOT_REPOSITORY } from "./application/ports/tender-lot.repository";
import { TENDER_STATUS_HISTORY_REPOSITORY } from "./application/ports/tender-status-history.repository";
import { TENDER_REPOSITORY } from "./application/ports/tender.repository";

import { ArchiveTenderUseCase } from "./application/use-cases/archive-tender.use-case";
import { RestoreTenderUseCase } from "./application/use-cases/restore-tender.use-case";
import { ChangeTenderStatusUseCase } from "./application/use-cases/change-tender-status.use-case";
import { ChangeTenderClientAccountUseCase } from "./application/use-cases/change-tender-client-account.use-case";
import { CreateTenderUseCase } from "./application/use-cases/create-tender.use-case";
import { GetTenderUseCase } from "./application/use-cases/get-tender.use-case";
import { GetTenderProfileUseCase } from "./application/use-cases/get-tender-profile.use-case";
import { GetTenderBoardUseCase } from "./application/use-cases/get-tender-board.use-case";
import { GetTenderListViewUseCase } from "./application/use-cases/get-tender-list-view.use-case";
import { GetTenderReadinessUseCase } from "./application/use-cases/get-tender-readiness.use-case";
import { GetTenderStatisticsUseCase } from "./application/use-cases/get-tender-statistics.use-case";
import { ListTendersUseCase } from "./application/use-cases/list-tenders.use-case";
import { ListTenderStatusHistoryUseCase } from "./application/use-cases/list-tender-status-history.use-case";
import { UpdateTenderUseCase } from "./application/use-cases/update-tender.use-case";
import {
  ArchiveBuyerUseCase,
  CreateBuyerUseCase,
  GetBuyerUseCase,
  ListBuyersUseCase,
  RestoreBuyerUseCase,
  UpdateBuyerUseCase,
} from "./application/use-cases/buyer.use-cases";

import { CreateTenderLotUseCase } from "./application/use-cases/create-tender-lot.use-case";
import { DeleteTenderLotUseCase, UpdateTenderLotUseCase } from "./application/use-cases/update-tender-lot.use-case";
import { GetTenderLotUseCase } from "./application/use-cases/get-tender-lot.use-case";
import { ListTenderLotsUseCase } from "./application/use-cases/list-tender-lots.use-case";
import { ReorderTenderLotsUseCase } from "./application/use-cases/reorder-tender-lots.use-case";
import { RestoreTenderLotUseCase } from "./application/use-cases/restore-tender-lot.use-case";

import { CreateChecklistItemUseCase } from "./application/use-cases/create-checklist-item.use-case";
import {
  ChangeChecklistItemStatusUseCase,
  UpdateChecklistItemUseCase,
} from "./application/use-cases/update-checklist-item.use-case";
import { ListChecklistItemsUseCase } from "./application/use-cases/list-checklist-items.use-case";
import { GetChecklistProgressUseCase } from "./application/use-cases/get-checklist-progress.use-case";
import {
  MarkChecklistItemNotApplicableUseCase,
  ValidateChecklistItemUseCase,
} from "./application/use-cases/validate-checklist-item.use-case";

import { CreateAwardCriterionUseCase } from "./application/use-cases/create-award-criterion.use-case";
import {
  DeleteAwardCriterionUseCase,
  UpdateAwardCriterionUseCase,
} from "./application/use-cases/update-award-criterion.use-case";
import { ListAwardCriteriaUseCase } from "./application/use-cases/list-award-criteria.use-case";

import { CreateRequestedDocumentUseCase } from "./application/use-cases/create-requested-document.use-case";
import {
  ChangeRequestedDocumentStatusUseCase,
  DeleteRequestedDocumentUseCase,
  UpdateRequestedDocumentUseCase,
} from "./application/use-cases/update-requested-document.use-case";
import { ListRequestedDocumentsUseCase } from "./application/use-cases/list-requested-documents.use-case";

import { CreateMilestoneUseCase } from "./application/use-cases/create-milestone.use-case";
import {
  DeleteMilestoneUseCase,
  MarkMilestoneDoneUseCase,
  UpdateMilestoneUseCase,
} from "./application/use-cases/update-milestone.use-case";
import { ListMilestonesUseCase } from "./application/use-cases/list-milestones.use-case";

import { CreateRiskUseCase } from "./application/use-cases/create-risk.use-case";
import { ChangeRiskStatusUseCase, UpdateRiskUseCase } from "./application/use-cases/update-risk.use-case";
import { ListRisksUseCase } from "./application/use-cases/list-risks.use-case";

import { CreateAlertUseCase } from "./application/use-cases/create-alert.use-case";
import { ResolveAlertUseCase } from "./application/use-cases/resolve-alert.use-case";
import { ListAlertsUseCase } from "./application/use-cases/list-alerts.use-case";

import { PrismaAlertRepository } from "./infrastructure/prisma-alert.repository";
import { PrismaAuditLogWriter } from "./infrastructure/prisma-audit-log.writer";
import { PrismaAwardCriterionRepository } from "./infrastructure/prisma-award-criterion.repository";
import { PrismaBuyerRepository } from "./infrastructure/prisma-buyer.repository";
import { PrismaChecklistItemRepository } from "./infrastructure/prisma-checklist-item.repository";
import { PrismaChecklistItemSourceRepository } from "./infrastructure/prisma-checklist-item-source.repository";
import { PrismaIlikeTenderSearchProvider } from "./infrastructure/prisma-ilike-tender-search.provider";
import { PrismaMilestoneRepository } from "./infrastructure/prisma-milestone.repository";
import { PrismaRequestedDocumentRepository } from "./infrastructure/prisma-requested-document.repository";
import { PrismaRiskRepository } from "./infrastructure/prisma-risk.repository";
import { PrismaTenderLotRepository } from "./infrastructure/prisma-tender-lot.repository";
import { PrismaTenderStatusHistoryRepository } from "./infrastructure/prisma-tender-status-history.repository";
import { PrismaTenderRepository } from "./infrastructure/prisma-tender.repository";
import { BuyersController } from "./interfaces/http/buyers.controller";
import { TenderLotsController } from "./interfaces/http/tender-lots.controller";
import { TendersController } from "./interfaces/http/tenders.controller";

@Module({
  imports: [IdentityModule, MembershipsModule, ClientPortfolioModule, OutboxModule],
  controllers: [TendersController, TenderLotsController, BuyersController],
  providers: [
    CreateTenderUseCase,
    UpdateTenderUseCase,
    GetTenderUseCase,
    GetTenderProfileUseCase,
    ListTendersUseCase,
    GetTenderBoardUseCase,
    GetTenderListViewUseCase,
    GetTenderStatisticsUseCase,
    ChangeTenderStatusUseCase,
    ChangeTenderClientAccountUseCase,
    ArchiveTenderUseCase,
    RestoreTenderUseCase,
    ListTenderStatusHistoryUseCase,
    GetTenderReadinessUseCase,

    ListBuyersUseCase,
    GetBuyerUseCase,
    CreateBuyerUseCase,
    UpdateBuyerUseCase,
    ArchiveBuyerUseCase,
    RestoreBuyerUseCase,

    CreateTenderLotUseCase,
    UpdateTenderLotUseCase,
    DeleteTenderLotUseCase,
    ListTenderLotsUseCase,
    GetTenderLotUseCase,
    RestoreTenderLotUseCase,
    ReorderTenderLotsUseCase,

    CreateChecklistItemUseCase,
    UpdateChecklistItemUseCase,
    ChangeChecklistItemStatusUseCase,
    ListChecklistItemsUseCase,
    GetChecklistProgressUseCase,
    ValidateChecklistItemUseCase,
    MarkChecklistItemNotApplicableUseCase,

    CreateAwardCriterionUseCase,
    UpdateAwardCriterionUseCase,
    DeleteAwardCriterionUseCase,
    ListAwardCriteriaUseCase,

    CreateRequestedDocumentUseCase,
    UpdateRequestedDocumentUseCase,
    ChangeRequestedDocumentStatusUseCase,
    DeleteRequestedDocumentUseCase,
    ListRequestedDocumentsUseCase,

    CreateMilestoneUseCase,
    UpdateMilestoneUseCase,
    MarkMilestoneDoneUseCase,
    DeleteMilestoneUseCase,
    ListMilestonesUseCase,

    CreateRiskUseCase,
    UpdateRiskUseCase,
    ChangeRiskStatusUseCase,
    ListRisksUseCase,

    CreateAlertUseCase,
    ResolveAlertUseCase,
    ListAlertsUseCase,

    { provide: TENDER_REPOSITORY, useClass: PrismaTenderRepository },
    { provide: BUYER_REPOSITORY, useClass: PrismaBuyerRepository },
    { provide: TENDER_SEARCH_PROVIDER, useClass: PrismaIlikeTenderSearchProvider },
    { provide: TENDER_LOT_REPOSITORY, useClass: PrismaTenderLotRepository },
    { provide: CHECKLIST_ITEM_REPOSITORY, useClass: PrismaChecklistItemRepository },
    { provide: CHECKLIST_ITEM_SOURCE_REPOSITORY, useClass: PrismaChecklistItemSourceRepository },
    { provide: AWARD_CRITERION_REPOSITORY, useClass: PrismaAwardCriterionRepository },
    { provide: REQUESTED_DOCUMENT_REPOSITORY, useClass: PrismaRequestedDocumentRepository },
    { provide: MILESTONE_REPOSITORY, useClass: PrismaMilestoneRepository },
    { provide: RISK_REPOSITORY, useClass: PrismaRiskRepository },
    { provide: ALERT_REPOSITORY, useClass: PrismaAlertRepository },
    { provide: TENDER_STATUS_HISTORY_REPOSITORY, useClass: PrismaTenderStatusHistoryRepository },
    { provide: AUDIT_LOG_WRITER, useClass: PrismaAuditLogWriter },
  ],
  // GetTenderUseCase est réexporté uniquement pour que le module Documents puisse vérifier
  // qu'un Tender existe et appartient à l'organisation active avant une association — même
  // motif que les réexports déjà pratiqués par Memberships (voir index.ts). TENDER_REPOSITORY
  // est réexporté pour un usage système interne par Extraction (mission Sprint 3 — lecture de
  // `Tender.language` comme indication OCR, jamais via un use case RBAC-gated dans ce contexte).
  //
  // V2 Sprint 4 — réexports pour `ai-suggestion-bridge` UNIQUEMENT : les ports/repositories
  // satellites sont réutilisés en LECTURE SEULE (détection de conflit — la cible porte-t-elle
  // déjà une valeur ?), jamais pour écrire — toute écriture passe exclusivement par le use case
  // public correspondant (Create*/Update*), jamais par le repository directement. Même motif que
  // TENDER_REPOSITORY déjà réexporté pour Extraction ci-dessus.
  exports: [
    GetTenderUseCase,
    // V2 Sprint 5 — réexporté pour `opportunity` (`PromoteOpportunityToTenderUseCase` délègue la
    // création du Tender à ce use case public, jamais une seconde logique de création dupliquée).
    CreateTenderUseCase,
    TENDER_REPOSITORY,
    UpdateTenderUseCase,
    TENDER_LOT_REPOSITORY,
    GetTenderLotUseCase,
    CreateTenderLotUseCase,
    UpdateTenderLotUseCase,
    AWARD_CRITERION_REPOSITORY,
    CreateAwardCriterionUseCase,
    UpdateAwardCriterionUseCase,
    REQUESTED_DOCUMENT_REPOSITORY,
    CreateRequestedDocumentUseCase,
    UpdateRequestedDocumentUseCase,
    MILESTONE_REPOSITORY,
    CreateMilestoneUseCase,
    UpdateMilestoneUseCase,
    RISK_REPOSITORY,
    CreateRiskUseCase,
    UpdateRiskUseCase,
    BUYER_REPOSITORY,
    CreateBuyerUseCase,
    UpdateBuyerUseCase,

    // V2 Sprint 6 — réexportés pour `ai-suggestion-bridge` (nouvel adaptateur CHECKLIST_ITEM) ET
    // pour le nouveau module `checklist-intelligence` (rapprochement documentaire + réconciliation
    // nouvelle analyse — ne peuvent pas vivre DANS `tenders`, voir `index.ts`).
    CHECKLIST_ITEM_REPOSITORY,
    CreateChecklistItemUseCase,
    UpdateChecklistItemUseCase,
    AUDIT_LOG_WRITER,

    // V2 Sprint 15 — réexportés pour `dashboard` (voir index.ts).
    GetTenderStatisticsUseCase,
    GetTenderListViewUseCase,
  ],
})
export class TendersModule {}
