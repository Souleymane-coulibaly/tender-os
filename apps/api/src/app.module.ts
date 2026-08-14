import { Module } from "@nestjs/common";
import { HealthModule } from "./health/health.module";
import { AdministrativeDossierModule } from "./modules/administrative-dossier";
import { AiBenchmarkModule, RoutingPolicyBridgeModule } from "./modules/ai-benchmark";
import { AiSuggestionModule } from "./modules/ai-suggestion";
import { AiSuggestionBridgeModule } from "./modules/ai-suggestion-bridge";
import { AnalysisModule } from "./modules/analysis/analysis.module";
import { BillingModule } from "./modules/billing";
// V2 Sprint 22 (billing, étape 22E, correctif audit Codex P1-02 round 4) — importé DIRECTEMENT
// depuis son fichier concret, jamais via `./modules/billing` (voir la note dans
// `quota-threshold-event-consumers.module.ts` : le réexporter depuis le barrel `billing`
// refermerait un cycle billing -> chat/documents -> tenders -> billing).
import { QuotaThresholdEventConsumersModule, QUOTA_THRESHOLD_OUTBOX_HANDLERS } from "./modules/billing/quota-threshold-event-consumers.module";
import { ChatModule } from "./modules/chat/chat.module";
import { ChecklistIntelligenceModule } from "./modules/checklist-intelligence/checklist-intelligence.module";
import { ClientPortfolioModule } from "./modules/client-portfolio/client-portfolio.module";
import { CockpitModule } from "./modules/cockpit";
import { CompanyProfileModule } from "./modules/company-profile";
import { ConnectorsModule } from "./modules/connectors";
import { DashboardModule } from "./modules/dashboard";
import { DceModule } from "./modules/dce/dce.module";
import { DeliverablesModule, ExportThemeResolverBridgeModule } from "./modules/deliverables";
import { DocumentGenerationModule } from "./modules/document-generation";
import { DocumentsModule } from "./modules/documents/documents.module";
import { ExportModule } from "./modules/export";
import { ExtractionModule } from "./modules/extraction/extraction.module";
import { ExtractionTriggerBridgeModule } from "./modules/extraction";
import { GenerationModule } from "./modules/generation";
import { IdentityModule } from "./modules/identity/identity.module";
import { IntegrationEventConsumersModule, IntegrationsModule, INTEGRATION_OUTBOX_HANDLERS } from "./modules/integrations";
import { KnowledgeBaseModule } from "./modules/knowledge-base/knowledge-base.module";
import { MarketWatchModule } from "./modules/market-watch";
import { MembershipsModule } from "./modules/memberships/memberships.module";
import { NotificationEventConsumersModule, NotificationsModule, NOTIFICATION_OUTBOX_HANDLERS } from "./modules/notifications";
import { OpportunityModule } from "./modules/opportunity";
import { OrganizationsModule } from "./modules/organizations/organizations.module";
import { OutboxModule } from "./modules/outbox";
import { PlatformAdministrationModule } from "./modules/platform-administration/platform-administration.module";
import { PricingModule } from "./modules/pricing/pricing.module";
import { PricingScheduleModule } from "./modules/pricing-schedule";
import { ResponsePackageModule } from "./modules/response-package";
import { SignatureModule } from "./modules/signature";
import { SubcontractorsModule, SubcontractorSubjectValidationBridgeModule } from "./modules/subcontractors";
import { SubmissionModule } from "./modules/submission";
import { SubmissionPackageModule } from "./modules/submission-package";
import { SubscriptionUsageModule } from "./modules/subscription-usage/subscription-usage.module";
import { TechnicalMemoModule } from "./modules/technical-memo";
import { TendersModule } from "./modules/tenders/tenders.module";
import { ValidationModule } from "./modules/validation";
import { WorkspaceModule } from "./modules/workspace/workspace.module";
import { DatabaseModule } from "./shared-kernel/database.module";
import { MetricsModule } from "./shared-kernel/metrics/metrics.module";
import { SharedKernelModule } from "./shared-kernel/shared-kernel.module";

@Module({
  imports: [
    SharedKernelModule,
    DatabaseModule,
    // V2 Sprint 16 — ferme la boucle event -> Outbox -> handler réel (mission §38/§134) :
    // `OutboxModule.forRoot` est le SEUL point d'assemblage des handlers Outbox de toute
    // l'application, appelé UNE SEULE FOIS ici. Voir la note d'architecture dans
    // outbox.module.ts/integration-event-consumers.module.ts (pourquoi ce n'est pas un simple
    // provider ajouté par le module consommateur). V2 Sprint 18 — `NotificationEventConsumersModule`/
    // `NOTIFICATION_OUTBOX_HANDLERS` ajoutés au même point d'assemblage (mission §15/§21/§50/§51),
    // 6 types d'événements `workspace` jusqu'ici sans aucun handler (aucune collision avec
    // `INTEGRATION_OUTBOX_HANDLERS`, voir notification-event-consumers.module.ts). V2 Sprint 22
    // (billing, étape 22E, correctif audit Codex P1-02 round 4) — `QuotaThresholdEventConsumersModule`/
    // `QUOTA_THRESHOLD_OUTBOX_HANDLERS` ajoutés au même point d'assemblage : `MembershipCreated`/
    // `ChatMessageSent`/`DocumentVersionAdded` (écrits par `memberships`/`chat`/`documents` à leur
    // propre point d'écriture réel, jamais depuis une lecture GET) jusqu'ici sans aucun handler.
    OutboxModule.forRoot({
      handlerImports: [IntegrationEventConsumersModule, NotificationEventConsumersModule, QuotaThresholdEventConsumersModule],
      handlers: [...INTEGRATION_OUTBOX_HANDLERS, ...NOTIFICATION_OUTBOX_HANDLERS, ...QUOTA_THRESHOLD_OUTBOX_HANDLERS],
    }),
    HealthModule,
    MetricsModule,
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
    ChatModule,
    DocumentGenerationModule,
    TechnicalMemoModule,
    PricingScheduleModule,
    ResponsePackageModule,
    DashboardModule,
    IntegrationsModule,
    NotificationsModule,
    MarketWatchModule,
    ConnectorsModule,
    BillingModule,
    SubscriptionUsageModule,
  ],
})
export class AppModule {}
