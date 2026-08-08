import { Module } from "@nestjs/common";
import { HealthModule } from "./health/health.module";
import { AdministrativeDossierModule } from "./modules/administrative-dossier";
import { AiBenchmarkModule, RoutingPolicyBridgeModule } from "./modules/ai-benchmark";
import { AiSuggestionModule } from "./modules/ai-suggestion";
import { AiSuggestionBridgeModule } from "./modules/ai-suggestion-bridge";
import { AnalysisModule } from "./modules/analysis/analysis.module";
import { ChecklistIntelligenceModule } from "./modules/checklist-intelligence/checklist-intelligence.module";
import { ClientPortfolioModule } from "./modules/client-portfolio/client-portfolio.module";
import { CockpitModule } from "./modules/cockpit";
import { CompanyProfileModule } from "./modules/company-profile";
import { DceModule } from "./modules/dce/dce.module";
import { DeliverablesModule, ExportThemeResolverBridgeModule } from "./modules/deliverables";
import { DocumentsModule } from "./modules/documents/documents.module";
import { ExportModule } from "./modules/export";
import { ExtractionModule } from "./modules/extraction/extraction.module";
import { ExtractionTriggerBridgeModule } from "./modules/extraction";
import { GenerationModule } from "./modules/generation";
import { IdentityModule } from "./modules/identity/identity.module";
import { KnowledgeBaseModule } from "./modules/knowledge-base/knowledge-base.module";
import { MembershipsModule } from "./modules/memberships/memberships.module";
import { OpportunityModule } from "./modules/opportunity";
import { OrganizationsModule } from "./modules/organizations/organizations.module";
import { OutboxModule } from "./modules/outbox";
import { PlatformAdministrationModule } from "./modules/platform-administration/platform-administration.module";
import { PricingModule } from "./modules/pricing/pricing.module";
import { SignatureModule } from "./modules/signature";
import { SubcontractorsModule, SubcontractorSubjectValidationBridgeModule } from "./modules/subcontractors";
import { SubmissionModule } from "./modules/submission";
import { SubmissionPackageModule } from "./modules/submission-package";
import { TendersModule } from "./modules/tenders/tenders.module";
import { ValidationModule } from "./modules/validation";
import { WorkspaceModule } from "./modules/workspace/workspace.module";
import { DatabaseModule } from "./shared-kernel/database.module";
import { SharedKernelModule } from "./shared-kernel/shared-kernel.module";

@Module({
  imports: [
    SharedKernelModule,
    DatabaseModule,
    OutboxModule,
    HealthModule,
    IdentityModule,
    OrganizationsModule,
    MembershipsModule,
    PlatformAdministrationModule,
    AiSuggestionModule,
    ClientPortfolioModule,
    TendersModule,
    DocumentsModule,
    DceModule,
    ExtractionModule,
    ExtractionTriggerBridgeModule,
    AnalysisModule,
    AiSuggestionBridgeModule,
    KnowledgeBaseModule,
    RoutingPolicyBridgeModule,
    AiBenchmarkModule,
    GenerationModule,
    PricingModule,
    ExportModule,
    ValidationModule,
    SignatureModule,
    SubmissionPackageModule,
    DeliverablesModule,
    ExportThemeResolverBridgeModule,
    CockpitModule,
    AdministrativeDossierModule,
    SubmissionModule,
    CompanyProfileModule,
    SubcontractorsModule,
    SubcontractorSubjectValidationBridgeModule,
    OpportunityModule,
    ChecklistIntelligenceModule,
    WorkspaceModule,
  ],
})
export class AppModule {}
