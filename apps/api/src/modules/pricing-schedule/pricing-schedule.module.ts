import { Module } from "@nestjs/common";
import { ClientPortfolioModule } from "../client-portfolio";
import { DceModule } from "../dce";
import { DocumentsModule } from "../documents";
import { IdentityModule } from "../identity";
import { MembershipsModule } from "../memberships";
import { TendersModule } from "../tenders";
import { ATOMIC_TRANSACTION_RUNNER } from "./application/ports/atomic-transaction-runner";
import { AUDIT_LOG_WRITER } from "./application/ports/audit-log-writer";
import { PRICING_SCHEDULE_FINAL_FILE_REPOSITORY } from "./application/ports/pricing-schedule-final-file.repository";
import { PRICING_SCHEDULE_LINE_REPOSITORY } from "./application/ports/pricing-schedule-line.repository";
import { PRICING_SCHEDULE_VERSION_REPOSITORY } from "./application/ports/pricing-schedule-version.repository";
import { PRICING_SCHEDULE_REPOSITORY } from "./application/ports/pricing-schedule.repository";
import { PricingScheduleAccessService } from "./application/services/pricing-schedule-access.service";
import { PricingScheduleLineEditGuard } from "./application/services/pricing-schedule-line-edit-guard.service";
import { CreatePricingScheduleUseCase } from "./application/use-cases/create-pricing-schedule.use-case";
import { ExtractPricingScheduleVersionUseCase } from "./application/use-cases/extract-pricing-schedule-version.use-case";
import { GeneratePricingScheduleFinalFileUseCase } from "./application/use-cases/generate-pricing-schedule-final-file.use-case";
import { GetBpuDqeCoherenceUseCase } from "./application/use-cases/get-bpu-dqe-coherence.use-case";
import { GetPricingScheduleControlsUseCase } from "./application/use-cases/get-pricing-schedule-controls.use-case";
import { GetPricingScheduleUseCase } from "./application/use-cases/get-pricing-schedule.use-case";
import { ListPricingSchedulesUseCase } from "./application/use-cases/list-pricing-schedules.use-case";
import { SetPricingScheduleLineCommentUseCase } from "./application/use-cases/set-pricing-schedule-line-comment.use-case";
import { SetPricingScheduleLineCostBreakdownUseCase } from "./application/use-cases/set-pricing-schedule-line-cost-breakdown.use-case";
import { SetPricingScheduleLineUnitPriceUseCase } from "./application/use-cases/set-pricing-schedule-line-unit-price.use-case";
import { ValidatePricingScheduleVersionUseCase } from "./application/use-cases/validate-pricing-schedule-version.use-case";
import { PrismaAtomicTransactionRunner } from "./infrastructure/prisma-atomic-transaction-runner";
import { PrismaAuditLogWriter } from "./infrastructure/prisma-audit-log.writer";
import { PrismaPricingScheduleFinalFileRepository } from "./infrastructure/prisma-pricing-schedule-final-file.repository";
import { PrismaPricingScheduleLineRepository } from "./infrastructure/prisma-pricing-schedule-line.repository";
import { PrismaPricingScheduleVersionRepository } from "./infrastructure/prisma-pricing-schedule-version.repository";
import { PrismaPricingScheduleRepository } from "./infrastructure/prisma-pricing-schedule.repository";
import { PricingSchedulesController } from "./interfaces/http/pricing-schedules.controller";
import { TenderPricingSchedulesController } from "./interfaces/http/tender-pricing-schedules.controller";

/**
 * V2 Sprint 13 — nouveau module séparé de `pricing` (AI cost-estimate, structurellement sans
 * rapport, décision déjà actée en amont de ce sprint) et de `document-generation` (gabarits
 * DOCX/placeholders, jamais adapté à des classeurs XLSX). Importe `DocumentsModule` (stockage du
 * fichier source ET du fichier final généré, réutilisé tel quel, aucun second stockage —
 * `CreateDocumentWithFirstVersionUseCase`/`AttachDocumentToTenderUseCase`/
 * `DOCUMENT_VERSION_REPOSITORY`/`STORAGE_PROVIDER`), `DceModule` (`ListDceDocumentsUseCase` —
 * jamais un second mécanisme de détection de fichier, mission §9 "pas de réimport"),
 * `TendersModule`/`ClientPortfolioModule` (dual-tier, même motif que Chat/Mémoire technique).
 */
@Module({
  imports: [IdentityModule, MembershipsModule, TendersModule, ClientPortfolioModule, DocumentsModule, DceModule],
  controllers: [TenderPricingSchedulesController, PricingSchedulesController],
  providers: [
    CreatePricingScheduleUseCase,
    ExtractPricingScheduleVersionUseCase,
    GetPricingScheduleUseCase,
    ListPricingSchedulesUseCase,
    SetPricingScheduleLineUnitPriceUseCase,
    SetPricingScheduleLineCostBreakdownUseCase,
    SetPricingScheduleLineCommentUseCase,
    GetPricingScheduleControlsUseCase,
    GetBpuDqeCoherenceUseCase,
    ValidatePricingScheduleVersionUseCase,
    GeneratePricingScheduleFinalFileUseCase,

    PricingScheduleAccessService,
    PricingScheduleLineEditGuard,

    { provide: PRICING_SCHEDULE_REPOSITORY, useClass: PrismaPricingScheduleRepository },
    { provide: PRICING_SCHEDULE_VERSION_REPOSITORY, useClass: PrismaPricingScheduleVersionRepository },
    { provide: PRICING_SCHEDULE_LINE_REPOSITORY, useClass: PrismaPricingScheduleLineRepository },
    { provide: PRICING_SCHEDULE_FINAL_FILE_REPOSITORY, useClass: PrismaPricingScheduleFinalFileRepository },
    { provide: AUDIT_LOG_WRITER, useClass: PrismaAuditLogWriter },
    { provide: ATOMIC_TRANSACTION_RUNNER, useClass: PrismaAtomicTransactionRunner },
  ],
  exports: [],
})
export class PricingScheduleModule {}
