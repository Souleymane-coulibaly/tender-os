import { Module } from "@nestjs/common";
import { AiSuggestionModule } from "../ai-suggestion";
import { AnalysisModule } from "../analysis";
import { CandidateCompanyModule } from "../candidate-company";
import { ClientPortfolioModule } from "../client-portfolio";
import { CompanyProfileModule } from "../company-profile";
import { DceModule } from "../dce";
import { DocumentsModule } from "../documents";
import { IdentityModule } from "../identity";
import { MembershipsModule } from "../memberships";
import { OutboxWriterModule } from "../outbox";
import { SubcontractorsModule } from "../subcontractors";
import { TendersModule } from "../tenders";
import { AttachChecklistItemDocumentUseCase, DetachChecklistItemDocumentUseCase } from "./application/use-cases/attach-checklist-item-document.use-case";
import { FindChecklistItemDocumentMatchesUseCase } from "./application/use-cases/find-checklist-item-document-matches.use-case";
import { GetChecklistFreshnessUseCase } from "./application/use-cases/get-checklist-freshness.use-case";
import { ReconcileChecklistWithNewAnalysisUseCase } from "./application/use-cases/reconcile-checklist-with-new-analysis.use-case";
import { ChecklistIntelligenceController } from "./interfaces/http/checklist-intelligence.controller";

/**
 * V2 Sprint 6 — module cross-cutting entre `tenders` (ChecklistItem, propriétaire du modèle) et
 * `documents`/`company-profile`/`subcontractors`/`analysis`/`ai-suggestion` (rapprochement
 * documentaire + réconciliation nouvelle analyse). Nécessaire car `documents` ET `analysis`
 * importent DÉJÀ `TendersModule` : `tenders` ne peut donc jamais les importer en retour sans créer
 * un cycle. Même position dans le graphe de dépendances que `opportunity`/`ai-suggestion-bridge`
 * (modules qui orchestrent plusieurs modules "feuille" sans jamais être importés par eux).
 *
 * Checkpoint 2.1-A6.1 — `CandidateCompanyModule` (déjà anticipé par le commentaire de
 * `candidate-company/index.ts` : "dossier, opportunity, checklist-intelligence, technical-memo...").
 * Module feuille (`imports: [IdentityModule, MembershipsModule]` uniquement) — aucun risque de
 * cycle, même discipline que les intégrations A4/A5 précédentes.
 *
 * Checkpoint 2.1-P2.1-FIX-B — `DceModule` (correctif : `ReconcileChecklistWithNewAnalysisUseCase`
 * injecte désormais `DCE_REPOSITORY` pour lire `dceRevision` au moment de la réconciliation ; sans
 * cet import, Nest ne pouvait pas résoudre la dépendance — trouvé par la suite HTTP+PostgreSQL
 * existante, jamais par le typecheck seul). Même position que `TendersModule`/`DocumentsModule`
 * dans le graphe : `DceModule` n'importe ni `checklist-intelligence` ni `analysis`, aucun cycle.
 */
@Module({
  imports: [
    IdentityModule,
    MembershipsModule,
    ClientPortfolioModule,
    TendersModule,
    DocumentsModule,
    CompanyProfileModule,
    CandidateCompanyModule,
    SubcontractorsModule,
    DceModule,
    AnalysisModule,
    AiSuggestionModule,
    OutboxWriterModule,
  ],
  controllers: [ChecklistIntelligenceController],
  providers: [
    FindChecklistItemDocumentMatchesUseCase,
    AttachChecklistItemDocumentUseCase,
    DetachChecklistItemDocumentUseCase,
    ReconcileChecklistWithNewAnalysisUseCase,
    GetChecklistFreshnessUseCase,
  ],
  // Checkpoint 2.1-P2.1-FIX-F — `GetChecklistFreshnessUseCase` réexporté en LECTURE SEULE pour
  // `submission` (agrégateur final de readiness), même motif que les autres réexports de fraîcheur
  // (`GetValidationFreshnessUseCase`/`GetResponsePackageFreshnessUseCase`/`GetTechnicalMemoFreshnessUseCase`).
  exports: [GetChecklistFreshnessUseCase],
})
export class ChecklistIntelligenceModule {}
