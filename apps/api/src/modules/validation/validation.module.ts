import { Module } from "@nestjs/common";
import { AnalysisModule } from "../analysis";
import { BillingModule } from "../billing";
import { ClientPortfolioModule } from "../client-portfolio";
import { ExportModule } from "../export";
import { IdentityModule } from "../identity";
import { MembershipsModule } from "../memberships";
import { SignatureModule } from "../signature";
import { TechnicalMemoModule } from "../technical-memo";
import { TendersModule } from "../tenders";
import { FINAL_APPROVAL_REPOSITORY } from "./application/ports/final-approval.repository";
import { VALIDATION_RUN_REPOSITORY } from "./application/ports/validation-run.repository";
import { ApproveFinalVersionUseCase } from "./application/use-cases/approve-final-version.use-case";
import { GetReadinessStatusUseCase } from "./application/use-cases/get-readiness-status.use-case";
import { GetValidationFreshnessUseCase } from "./application/use-cases/get-validation-freshness.use-case";
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
 * Generation → Analysis). `SignatureModule` importé de même (mission Sprint 8A.2, correction
 * bug #5 — `GetReadinessStatusUseCase` lit `SIGNATURE_REQUIREMENT_REPOSITORY`/
 * `SIGNATURE_TRANSACTION_REPOSITORY` en lecture seule pour réconcilier l'état réel de signature ;
 * Signature n'importe jamais Validation en retour, aucun cycle) — même lecture EXACTE déjà
 * pratiquée par `submission-package` (Sprint 8A bis), jamais un second calcul divergent.
 */
@Module({
  imports: [IdentityModule, MembershipsModule, TendersModule, ClientPortfolioModule, ExportModule, SignatureModule, AnalysisModule, TechnicalMemoModule, BillingModule],
  controllers: [ValidationController],
  providers: [
    RunFinalValidationUseCase,
    GetValidationRunUseCase,
    ResolveValidationIssueUseCase,
    ReopenValidationIssueUseCase,
    ApproveFinalVersionUseCase,
    ReopenFinalVersionUseCase,
    GetReadinessStatusUseCase,
    GetValidationFreshnessUseCase,

    { provide: VALIDATION_RUN_REPOSITORY, useClass: PrismaValidationRunRepository },
    { provide: FINAL_APPROVAL_REPOSITORY, useClass: PrismaFinalApprovalRepository },
  ],
  // Réexportés pour permettre à Package (Sprint 8A bis) de vérifier l'approbation active et le
  // dernier run avant de créer un package — jamais une seconde écriture sur ces tables.
  // `GetValidationRunUseCase` réexporté en plus pour Sprint 8A.1 (Deliverables) — vue LECTURE SEULE
  // "Rapport de validation" (contrôles/blocages/avertissements du dernier run).
  // Checkpoint 2.1-P2.1-FIX-E — `AnalysisModule`/`TechnicalMemoModule` importés UNIQUEMENT pour
  // leurs ports de LECTURE SEULE réexportés (`GetEffectiveTenderAnalysisSummaryUseCase`/
  // `GetTechnicalMemoRevisionFingerprintForTenderUseCase`), même motif que Sprint 14
  // (`response-package`) — jamais un second accès direct aux repositories de ces modules.
  exports: [GetReadinessStatusUseCase, GetValidationRunUseCase, GetValidationFreshnessUseCase, FINAL_APPROVAL_REPOSITORY, VALIDATION_RUN_REPOSITORY],
})
export class ValidationModule {}
