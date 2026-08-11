import { Module } from "@nestjs/common";
import { ClientPortfolioModule } from "../client-portfolio";
import { IdentityModule } from "../identity";
import { MembershipsModule } from "../memberships";
import { OpportunityModule } from "../opportunity";
import { ResponsePackageModule } from "../response-package";
import { TendersModule } from "../tenders";
import { WorkspaceModule } from "../workspace";
import { GetDashboardOverviewUseCase } from "./application/use-cases/get-dashboard-overview.use-case";
import { DashboardController } from "./interfaces/http/dashboard.controller";

/**
 * V2 Sprint 15 (Dashboard opérationnel) — décision architecturale validée (AskUserQuestion) :
 * module ÉTROIT, read-model pur composant des use-cases bulk "for-dashboard" déjà exportés par
 * chaque module propriétaire (Tenders/ResponsePackage/Opportunity/Workspace), jamais un accès
 * Prisma cross-module direct (contrairement à une option CQRS envisagée puis écartée — voir rapport
 * Sprint 15 §"architecture Dashboard"). Aucun modèle Prisma propre à ce module : le Dashboard ne
 * persiste rien, il projette (mission §53).
 */
@Module({
  imports: [IdentityModule, MembershipsModule, ClientPortfolioModule, TendersModule, ResponsePackageModule, OpportunityModule, WorkspaceModule],
  controllers: [DashboardController],
  providers: [GetDashboardOverviewUseCase],
})
export class DashboardModule {}
