import { Module } from "@nestjs/common";
import { ClientPortfolioModule } from "../client-portfolio";
import { IdentityModule } from "../identity";
import { MembershipsModule } from "../memberships";
import { TendersModule } from "../tenders";
import { AUDIT_LOG_WRITER } from "./application/ports/audit-log-writer";
import { GENERATION_COST_READER } from "./application/ports/generation-cost-reader";
import { PRICING_ESTIMATE_REPOSITORY } from "./application/ports/pricing-estimate.repository";
import { ArchivePricingEstimateUseCase } from "./application/use-cases/archive-pricing-estimate.use-case";
import { CompareEstimatedAndActualCostUseCase } from "./application/use-cases/compare-estimated-and-actual-cost.use-case";
import { CreatePricingEstimateUseCase } from "./application/use-cases/create-pricing-estimate.use-case";
import { GetClientCostSummaryUseCase } from "./application/use-cases/get-client-cost-summary.use-case";
import { GetOrganizationCostSummaryUseCase } from "./application/use-cases/get-organization-cost-summary.use-case";
import { GetPricingEstimateUseCase } from "./application/use-cases/get-pricing-estimate.use-case";
import { GetTenderCostSummaryUseCase } from "./application/use-cases/get-tender-cost-summary.use-case";
import { ListPricingEstimatesUseCase } from "./application/use-cases/list-pricing-estimates.use-case";
import { PreviewGenerationCostUseCase } from "./application/use-cases/preview-generation-cost.use-case";
import { RecalculatePricingEstimateUseCase } from "./application/use-cases/recalculate-pricing-estimate.use-case";
import { PrismaAuditLogWriter } from "./infrastructure/prisma-audit-log.writer";
import { PrismaGenerationCostReader } from "./infrastructure/prisma-generation-cost.reader";
import { PrismaPricingEstimateRepository } from "./infrastructure/prisma-pricing-estimate.repository";
import { PricingController } from "./interfaces/http/pricing.controller";

/**
 * Module Pricing (Sprint 7) — importe `TendersModule`/`ClientPortfolioModule` dans UN SEUL sens
 * (réutilise `GetTenderUseCase`, `AssertClientAccessUseCase`/`GetClientAccountUseCase`) : aucun de
 * ces modules n'importe jamais Pricing en retour, évitant tout cycle Nest (même motif que
 * generation → tenders/client-portfolio, Sprint 6). L'intégration au routage/pricing Sprint 5.2
 * (`ROUTING_MODEL_READER`/`PRICING_SNAPSHOT_READER`, tokens propres à Pricing) passe par le pont
 * `@Global()` `RoutingPolicyBridgeModule` (ai-benchmark, déjà importé par `AppModule`) — absent,
 * `@Optional()` sur les use cases concernés dégrade proprement (prévision/coût IA en `UNKNOWN`,
 * jamais un crash). `GenerationCostReader` lit directement la table `generations` partagée, sans
 * dépendance au module `generation` lui-même (mission "ne refais pas le Sprint 6").
 */
@Module({
  imports: [IdentityModule, MembershipsModule, TendersModule, ClientPortfolioModule],
  controllers: [PricingController],
  providers: [
    PreviewGenerationCostUseCase,
    CreatePricingEstimateUseCase,
    RecalculatePricingEstimateUseCase,
    GetPricingEstimateUseCase,
    ListPricingEstimatesUseCase,
    ArchivePricingEstimateUseCase,
    GetTenderCostSummaryUseCase,
    GetClientCostSummaryUseCase,
    GetOrganizationCostSummaryUseCase,
    CompareEstimatedAndActualCostUseCase,

    { provide: PRICING_ESTIMATE_REPOSITORY, useClass: PrismaPricingEstimateRepository },
    { provide: GENERATION_COST_READER, useClass: PrismaGenerationCostReader },
    { provide: AUDIT_LOG_WRITER, useClass: PrismaAuditLogWriter },
  ],
})
export class PricingModule {}
