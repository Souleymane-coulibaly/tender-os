import { Module } from "@nestjs/common";
import { ClientPortfolioModule } from "../client-portfolio";
import { ExportModule } from "../export";
import { IdentityModule } from "../identity";
import { MembershipsModule } from "../memberships";
import { TendersModule } from "../tenders";
import { FINAL_APPROVAL_REPOSITORY } from "./application/ports/final-approval.repository";
import { VALIDATION_RUN_REPOSITORY } from "./application/ports/validation-run.repository";
import { ApproveFinalVersionUseCase } from "./application/use-cases/approve-final-version.use-case";
import { GetReadinessStatusUseCase } from "./application/use-cases/get-readiness-status.use-case";
import { GetValidationRunUseCase } from "./application/use-cases/get-validation-run.use-case";
import { ReopenFinalVersionUseCase } from "./application/use-cases/reopen-final-version.use-case";
import { ReopenValidationIssueUseCase } from "./application/use-cases/reopen-validation-issue.use-case";
import { ResolveValidationIssueUseCase } from "./application/use-cases/resolve-validation-issue.use-case";
import { RunFinalValidationUseCase } from "./application/use-cases/run-final-validation.use-case";
import { PrismaFinalApprovalRepository } from "./infrastructure/prisma-final-approval.repository";
import { PrismaValidationRunRepository } from "./infrastructure/prisma-validation-run.repository";
import { ValidationController } from "./interfaces/http/validation.controller";

/**
 * Module Validation (Sprint 8A bis) — importe `ExportModule` dans UN SEUL sens (lit les
 * `ExportJob`/templates, déclenche `GenerateFinalExportUseCase` après approbation) : Export
 * n'importe jamais Validation en retour, évitant tout cycle Nest (même motif que
 * Generation → Analysis).
 */
@Module({
  imports: [IdentityModule, MembershipsModule, TendersModule, ClientPortfolioModule, ExportModule],
  controllers: [ValidationController],
  providers: [
    RunFinalValidationUseCase,
    GetValidationRunUseCase,
    ResolveValidationIssueUseCase,
    ReopenValidationIssueUseCase,
    ApproveFinalVersionUseCase,
    ReopenFinalVersionUseCase,
    GetReadinessStatusUseCase,

    { provide: VALIDATION_RUN_REPOSITORY, useClass: PrismaValidationRunRepository },
    { provide: FINAL_APPROVAL_REPOSITORY, useClass: PrismaFinalApprovalRepository },
  ],
  // Réexportés pour permettre à Package (Sprint 8A bis) de vérifier l'approbation active et le
  // dernier run avant de créer un package — jamais une seconde écriture sur ces tables.
  exports: [GetReadinessStatusUseCase, FINAL_APPROVAL_REPOSITORY, VALIDATION_RUN_REPOSITORY],
})
export class ValidationModule {}
