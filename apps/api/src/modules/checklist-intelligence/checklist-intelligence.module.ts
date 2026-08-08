import { Module } from "@nestjs/common";
import { AiSuggestionModule } from "../ai-suggestion";
import { AnalysisModule } from "../analysis";
import { ClientPortfolioModule } from "../client-portfolio";
import { CompanyProfileModule } from "../company-profile";
import { DocumentsModule } from "../documents";
import { IdentityModule } from "../identity";
import { MembershipsModule } from "../memberships";
import { OutboxModule } from "../outbox";
import { SubcontractorsModule } from "../subcontractors";
import { TendersModule } from "../tenders";
import { AttachChecklistItemDocumentUseCase, DetachChecklistItemDocumentUseCase } from "./application/use-cases/attach-checklist-item-document.use-case";
import { FindChecklistItemDocumentMatchesUseCase } from "./application/use-cases/find-checklist-item-document-matches.use-case";
import { ReconcileChecklistWithNewAnalysisUseCase } from "./application/use-cases/reconcile-checklist-with-new-analysis.use-case";
import { ChecklistIntelligenceController } from "./interfaces/http/checklist-intelligence.controller";

/**
 * V2 Sprint 6 — module cross-cutting entre `tenders` (ChecklistItem, propriétaire du modèle) et
 * `documents`/`company-profile`/`subcontractors`/`analysis`/`ai-suggestion` (rapprochement
 * documentaire + réconciliation nouvelle analyse). Nécessaire car `documents` ET `analysis`
 * importent DÉJÀ `TendersModule` : `tenders` ne peut donc jamais les importer en retour sans créer
 * un cycle. Même position dans le graphe de dépendances que `opportunity`/`ai-suggestion-bridge`
 * (modules qui orchestrent plusieurs modules "feuille" sans jamais être importés par eux).
 */
@Module({
  imports: [IdentityModule, MembershipsModule, ClientPortfolioModule, TendersModule, DocumentsModule, CompanyProfileModule, SubcontractorsModule, AnalysisModule, AiSuggestionModule, OutboxModule],
  controllers: [ChecklistIntelligenceController],
  providers: [FindChecklistItemDocumentMatchesUseCase, AttachChecklistItemDocumentUseCase, DetachChecklistItemDocumentUseCase, ReconcileChecklistWithNewAnalysisUseCase],
})
export class ChecklistIntelligenceModule {}
