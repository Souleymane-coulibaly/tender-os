import { Module } from "@nestjs/common";
import { AnalysisModule } from "../analysis/analysis.module";
import { CandidateCompanyModule } from "../candidate-company";
import { ClientPortfolioModule } from "../client-portfolio";
import { CompanyProfileModule } from "../company-profile";
import { DocumentGenerationModule } from "../document-generation";
import { DocumentsModule } from "../documents";
import { IdentityModule } from "../identity";
import { KnowledgeBaseModule } from "../knowledge-base/knowledge-base.module";
import { MembershipsModule } from "../memberships";
import { TendersModule } from "../tenders";
import { ATOMIC_TRANSACTION_RUNNER } from "./application/ports/atomic-transaction-runner";
import { AUDIT_LOG_WRITER } from "./application/ports/audit-log-writer";
import { TECHNICAL_MEMO_REPOSITORY } from "./application/ports/technical-memo.repository";
import { TECHNICAL_MEMO_SECTION_REPOSITORY } from "./application/ports/technical-memo-section.repository";
import { TECHNICAL_MEMO_SECTION_REQUIREMENT_REPOSITORY } from "./application/ports/technical-memo-section-requirement.repository";
import { TECHNICAL_MEMO_SECTION_REVISION_REPOSITORY } from "./application/ports/technical-memo-section-revision.repository";
import { TechnicalMemoAccessService } from "./application/services/technical-memo-access.service";
import { TechnicalMemoSectionContextAssembler } from "./application/services/technical-memo-section-context-assembler";
import { ConfirmTechnicalMemoRequirementCoverageUseCase } from "./application/use-cases/confirm-technical-memo-requirement-coverage.use-case";
import { CreateTechnicalMemoUseCase } from "./application/use-cases/create-technical-memo.use-case";
import { EditTechnicalMemoSectionUseCase } from "./application/use-cases/edit-technical-memo-section.use-case";
import { ExportTechnicalMemoUseCase } from "./application/use-cases/export-technical-memo.use-case";
import { GenerateTechnicalMemoSectionUseCase } from "./application/use-cases/generate-technical-memo-section.use-case";
import { GetSectionRevisionTenderRefForApprovalUseCase } from "./application/use-cases/get-section-revision-tender-ref-for-approval.use-case";
import { GetTechnicalMemoCoverageUseCase } from "./application/use-cases/get-technical-memo-coverage.use-case";
import { GetTechnicalMemoFreshnessUseCase } from "./application/use-cases/get-technical-memo-freshness.use-case";
import { GetTechnicalMemoRevisionFingerprintForTenderUseCase } from "./application/use-cases/get-technical-memo-revision-fingerprint-for-tender.use-case";
import { GetTechnicalMemoUseCase } from "./application/use-cases/get-technical-memo.use-case";
import { ListTechnicalMemosUseCase } from "./application/use-cases/list-technical-memos.use-case";
import { ListValidatedTechnicalMemosForPackageUseCase } from "./application/use-cases/list-validated-technical-memos-for-package.use-case";
import { MapTechnicalMemoSectionsUseCase } from "./application/use-cases/map-technical-memo-sections.use-case";
import { PrepareTechnicalMemoTemplateUseCase } from "./application/use-cases/prepare-technical-memo-template.use-case";
import { ValidateTechnicalMemoSectionUseCase } from "./application/use-cases/validate-technical-memo-section.use-case";
import { loadTechnicalMemoAiConfig, TECHNICAL_MEMO_AI_CONFIG } from "./infrastructure/technical-memo-ai-config";
import { PrismaAtomicTransactionRunner } from "./infrastructure/prisma-atomic-transaction-runner";
import { PrismaAuditLogWriter } from "./infrastructure/prisma-audit-log.writer";
import { PrismaTechnicalMemoRepository } from "./infrastructure/prisma-technical-memo.repository";
import { PrismaTechnicalMemoSectionRepository } from "./infrastructure/prisma-technical-memo-section.repository";
import { PrismaTechnicalMemoSectionRequirementRepository } from "./infrastructure/prisma-technical-memo-section-requirement.repository";
import { PrismaTechnicalMemoSectionRevisionRepository } from "./infrastructure/prisma-technical-memo-section-revision.repository";
import { TechnicalMemosController } from "./interfaces/http/technical-memos.controller";
import { TenderTechnicalMemosController } from "./interfaces/http/tender-technical-memos.controller";

/**
 * V2 Sprint 12 — nouveau module séparé de `deliverables`/`document-generation` (décision validée
 * via AskUserQuestion : même motif que `document-generation` vs `export`/`administrative-dossier`,
 * technique différente pour un besoin conceptuellement proche). Importe `DocumentsModule` (stockage
 * de l'original uploadé, réutilisé tel quel, aucun second stockage), `TendersModule`/
 * `ClientPortfolioModule` (dual-tier, même motif que Chat/Export/Dossier administratif),
 * `AnalysisModule` (findings DCE + `AI_PROVIDER_REGISTRY`, même port que Chat/Generation),
 * `KnowledgeBaseModule`/`CompanyProfileModule` (recherche validée + données candidat réelles,
 * mission §23-27). `CandidateCompanyModule` (Checkpoint 2.1-A4, correctif post-audit) — SOT
 * identité candidat via `ResolveCandidateIdentityUseCase`, même discipline NEW/LEGACY FLOW que
 * DC1/DC2/DC4. Réutilise `document-generation` (Sprint 10) via `DOCUMENT_TEMPLATE_REPOSITORY`
 * (`PrepareTechnicalMemoTemplateUseCase` crée elle-même son `DocumentTemplate`/`DocumentTemplateVersion`
 * dérivé, jamais via les use cases HTTP publics — voir le commentaire d'export dans
 * `document-generation/index.ts`). L'export DOCX final (`DocumentGenerationExecutionService.run()`)
 * sera ajouté quand cette étape sera implémentée.
 */
@Module({
  imports: [
    IdentityModule,
    MembershipsModule,
    TendersModule,
    ClientPortfolioModule,
    DocumentsModule,
    DocumentGenerationModule,
    AnalysisModule,
    KnowledgeBaseModule,
    CompanyProfileModule,
    CandidateCompanyModule,
  ],
  controllers: [TenderTechnicalMemosController, TechnicalMemosController],
  providers: [
    CreateTechnicalMemoUseCase,
    GetTechnicalMemoUseCase,
    GetTechnicalMemoFreshnessUseCase,
    ListTechnicalMemosUseCase,
    ListValidatedTechnicalMemosForPackageUseCase,
    PrepareTechnicalMemoTemplateUseCase,
    MapTechnicalMemoSectionsUseCase,
    GenerateTechnicalMemoSectionUseCase,
    GetTechnicalMemoCoverageUseCase,
    ConfirmTechnicalMemoRequirementCoverageUseCase,
    ValidateTechnicalMemoSectionUseCase,
    EditTechnicalMemoSectionUseCase,
    ExportTechnicalMemoUseCase,
    GetSectionRevisionTenderRefForApprovalUseCase,
    GetTechnicalMemoRevisionFingerprintForTenderUseCase,

    TechnicalMemoAccessService,
    TechnicalMemoSectionContextAssembler,

    { provide: TECHNICAL_MEMO_REPOSITORY, useClass: PrismaTechnicalMemoRepository },
    { provide: TECHNICAL_MEMO_SECTION_REPOSITORY, useClass: PrismaTechnicalMemoSectionRepository },
    { provide: TECHNICAL_MEMO_SECTION_REVISION_REPOSITORY, useClass: PrismaTechnicalMemoSectionRevisionRepository },
    { provide: TECHNICAL_MEMO_SECTION_REQUIREMENT_REPOSITORY, useClass: PrismaTechnicalMemoSectionRequirementRepository },
    { provide: AUDIT_LOG_WRITER, useClass: PrismaAuditLogWriter },
    { provide: ATOMIC_TRANSACTION_RUNNER, useClass: PrismaAtomicTransactionRunner },
    { provide: TECHNICAL_MEMO_AI_CONFIG, useValue: loadTechnicalMemoAiConfig() },
  ],
  // Sprint 14 — exporte UNIQUEMENT le port en lecture seule pour `response-package` (même motif
  // que `AdministrativeDossierModule.exports`), jamais l'ensemble du module. Sprint 18 — même motif
  // pour `workspace` (validation d'une cible ApprovalRequest TECHNICAL_MEMO_SECTION_REVISION).
  // Checkpoint 2.1-P2.1-FIX-E — même motif pour `validation`. Checkpoint 2.1-P2.1-FIX-F —
  // `ListTechnicalMemosUseCase`/`GetTechnicalMemoFreshnessUseCase` réexportés pour `submission`.
  exports: [
    ListValidatedTechnicalMemosForPackageUseCase,
    GetSectionRevisionTenderRefForApprovalUseCase,
    GetTechnicalMemoRevisionFingerprintForTenderUseCase,
    ListTechnicalMemosUseCase,
    GetTechnicalMemoFreshnessUseCase,
  ],
})
export class TechnicalMemoModule {}
