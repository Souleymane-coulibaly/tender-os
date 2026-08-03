import { Module } from "@nestjs/common";
import { HealthModule } from "./health/health.module";
import { AiBenchmarkModule, RoutingPolicyBridgeModule } from "./modules/ai-benchmark";
import { AnalysisModule } from "./modules/analysis/analysis.module";
import { ClientPortfolioModule } from "./modules/client-portfolio/client-portfolio.module";
import { CockpitModule } from "./modules/cockpit";
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
import { OrganizationsModule } from "./modules/organizations/organizations.module";
import { PlatformAdministrationModule } from "./modules/platform-administration/platform-administration.module";
import { PricingModule } from "./modules/pricing/pricing.module";
import { SignatureModule } from "./modules/signature";
import { SubmissionPackageModule } from "./modules/submission-package";
import { TendersModule } from "./modules/tenders/tenders.module";
import { ValidationModule } from "./modules/validation";
import { DatabaseModule } from "./shared-kernel/database.module";
import { SharedKernelModule } from "./shared-kernel/shared-kernel.module";

@Module({
  imports: [
    SharedKernelModule,
    DatabaseModule,
    HealthModule,
    IdentityModule,
    OrganizationsModule,
    MembershipsModule,
    PlatformAdministrationModule,
    ClientPortfolioModule,
    TendersModule,
    DocumentsModule,
    DceModule,
    ExtractionModule,
    ExtractionTriggerBridgeModule,
    AnalysisModule,
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
  ],
})
export class AppModule {}
