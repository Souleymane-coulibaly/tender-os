import { Module } from "@nestjs/common";
import { ClientPortfolioModule } from "../client-portfolio";
import { DocumentsModule } from "../documents";
import { IdentityModule } from "../identity";
import { MembershipsModule } from "../memberships";
import { SubmissionPackageModule } from "../submission-package";
import { TendersModule } from "../tenders";
import { ValidationModule } from "../validation";

import { AUDIT_LOG_WRITER } from "./application/ports/audit-log-writer";
import { SUBMISSION_PROOF_REPOSITORY } from "./application/ports/submission-proof.repository";
import { TENDER_SUBMISSION_REPOSITORY } from "./application/ports/tender-submission.repository";

import { AddSubmissionProofUseCase } from "./application/use-cases/add-submission-proof.use-case";
import { CancelTenderSubmissionUseCase } from "./application/use-cases/cancel-tender-submission.use-case";
import { ConfirmSubmissionReceiptUseCase } from "./application/use-cases/confirm-submission-receipt.use-case";
import { GetTenderSubmissionCapabilitiesUseCase } from "./application/use-cases/get-tender-submission-capabilities.use-case";
import { GetTenderSubmissionReadinessUseCase } from "./application/use-cases/get-tender-submission-readiness.use-case";
import { GetTenderSubmissionUseCase } from "./application/use-cases/get-tender-submission.use-case";
import { ListTenderSubmissionsUseCase } from "./application/use-cases/list-tender-submissions.use-case";
import { RecordSubmissionRejectionUseCase } from "./application/use-cases/record-submission-rejection.use-case";
import { RecordTenderSubmissionUseCase } from "./application/use-cases/record-tender-submission.use-case";
import { ReplaceTenderSubmissionUseCase } from "./application/use-cases/replace-tender-submission.use-case";
import { StartTenderSubmissionUseCase } from "./application/use-cases/start-tender-submission.use-case";
import { WithdrawTenderSubmissionUseCase } from "./application/use-cases/withdraw-tender-submission.use-case";

import { SubmissionAccessService } from "./application/services/submission-access.service";
import { SubmissionPackageResolverService } from "./application/services/submission-package-resolver.service";

import { PrismaAuditLogWriter } from "./infrastructure/prisma-audit-log.writer";
import { PrismaSubmissionProofRepository } from "./infrastructure/prisma-submission-proof.repository";
import { PrismaTenderSubmissionRepository } from "./infrastructure/prisma-tender-submission.repository";

import { SubmissionController } from "./interfaces/http/submission.controller";

/**
 * Sprint 9 — module `submission` : dépôt manuel assisté et suivi de soumission. Importe
 * `TendersModule`/`ClientPortfolioModule`/`DocumentsModule`/`ValidationModule`/
 * `SubmissionPackageModule` dans UN SEUL sens (même motif que `AdministrativeDossierModule`) —
 * aucun de ces modules n'importe jamais `submission` en retour. `ValidationModule` est nécessaire
 * à `GetTenderSubmissionReadinessUseCase` (via `GetReadinessStatusUseCase`, déjà exporté) — jamais
 * un second calcul de validation/signature ; `SignatureModule` n'est jamais importé ici
 * directement, `ValidationModule` porte déjà cette dépendance transitive pour ses propres besoins.
 * Exporte les query use-cases nécessaires à `cockpit` (même motif que
 * `ListValidatedAdministrativeDocumentsForPackageUseCase`/`ListSubmissionPackagesUseCase`).
 */
@Module({
  imports: [IdentityModule, MembershipsModule, TendersModule, ClientPortfolioModule, DocumentsModule, ValidationModule, SubmissionPackageModule],
  controllers: [SubmissionController],
  providers: [
    GetTenderSubmissionReadinessUseCase,
    GetTenderSubmissionCapabilitiesUseCase,
    ListTenderSubmissionsUseCase,
    GetTenderSubmissionUseCase,
    StartTenderSubmissionUseCase,
    RecordTenderSubmissionUseCase,
    AddSubmissionProofUseCase,
    ConfirmSubmissionReceiptUseCase,
    ReplaceTenderSubmissionUseCase,
    WithdrawTenderSubmissionUseCase,
    CancelTenderSubmissionUseCase,
    RecordSubmissionRejectionUseCase,

    SubmissionAccessService,
    SubmissionPackageResolverService,

    { provide: TENDER_SUBMISSION_REPOSITORY, useClass: PrismaTenderSubmissionRepository },
    { provide: SUBMISSION_PROOF_REPOSITORY, useClass: PrismaSubmissionProofRepository },
    { provide: AUDIT_LOG_WRITER, useClass: PrismaAuditLogWriter },
  ],
  exports: [GetTenderSubmissionReadinessUseCase, ListTenderSubmissionsUseCase],
})
export class SubmissionModule {}
