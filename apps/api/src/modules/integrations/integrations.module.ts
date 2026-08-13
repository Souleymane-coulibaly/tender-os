import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { BillingModule } from "../billing";
import { ClientPortfolioModule } from "../client-portfolio";
import { IdentityModule } from "../identity";
import { MembershipsModule } from "../memberships";
import { ResponsePackageModule } from "../response-package";
import { TendersModule } from "../tenders";
import { API_KEY_REPOSITORY } from "./application/ports/api-key.repository";
import { AUDIT_LOG_WRITER } from "./application/ports/audit-log-writer";
import { AuthenticateApiKeyUseCase } from "./application/use-cases/authenticate-api-key.use-case";
import { CreateApiKeyUseCase } from "./application/use-cases/create-api-key.use-case";
import { CreateWebhookSubscriptionUseCase } from "./application/use-cases/create-webhook-subscription.use-case";
import { DeleteWebhookSubscriptionUseCase } from "./application/use-cases/delete-webhook-subscription.use-case";
import { GetWebhookSubscriptionUseCase } from "./application/use-cases/get-webhook-subscription.use-case";
import { ListApiKeysUseCase } from "./application/use-cases/list-api-keys.use-case";
import { ListWebhookDeliveriesUseCase } from "./application/use-cases/list-webhook-deliveries.use-case";
import { ListWebhookSubscriptionsUseCase } from "./application/use-cases/list-webhook-subscriptions.use-case";
import { RetryWebhookDeliveryUseCase } from "./application/use-cases/retry-webhook-delivery.use-case";
import { RevokeApiKeyUseCase } from "./application/use-cases/revoke-api-key.use-case";
import { SendTestWebhookEventUseCase } from "./application/use-cases/send-test-webhook-event.use-case";
import { SetWebhookSubscriptionStatusUseCase } from "./application/use-cases/set-webhook-subscription-status.use-case";
import { UpdateWebhookSubscriptionUseCase } from "./application/use-cases/update-webhook-subscription.use-case";
import { IntegrationEventConsumersModule } from "./integration-event-consumers.module";
import { DeliverWebhookService } from "./infrastructure/deliver-webhook.service";
import { ApiKeyThrottlerGuard } from "./interfaces/http/api-key-throttler.guard";
import { PrismaApiKeyRepository } from "./infrastructure/prisma-api-key.repository";
import { PrismaAuditLogWriter } from "./infrastructure/prisma-audit-log.writer";
import { WebhookDeliveryWorker } from "./infrastructure/webhook-delivery.worker";
import { ApiKeyGuard } from "./interfaces/http/api-key.guard";
import { ApiKeysController } from "./interfaces/http/api-keys.controller";
import { PublicResponsePackagesController } from "./interfaces/http/public/public-response-packages.controller";
import { PublicTendersController } from "./interfaces/http/public/public-tenders.controller";
import { WebhooksController } from "./interfaces/http/webhooks.controller";

/**
 * V2 Sprint 16 (Integration Hub) — module complet : API Keys, Webhooks (CRUD + delivery worker
 * réel), Public API en lecture seule (mission §5 "éviter de disperser webhooks/API keys/
 * connexions/logs dans différents modules"). Importe `IntegrationEventConsumersModule` pour
 * réutiliser SES repositories webhook (jamais une seconde paire de bindings pour le même token) —
 * jamais l'inverse (voir la note d'architecture dans `integration-event-consumers.module.ts`).
 * N'importe PAS `OutboxModule` : ce module ne PRODUIT aucun événement, seul `response-package`
 * (entre autres) le fait, avec son propre import direct.
 */
@Module({
  imports: [
    IdentityModule,
    MembershipsModule,
    ClientPortfolioModule,
    TendersModule,
    ResponsePackageModule,
    IntegrationEventConsumersModule,
    // V2 Sprint 22 (billing, étape 22A, correctif audit Codex P1-01) — API Keys (PUBLIC_API) et
    // Webhooks (WEBHOOKS) sont désormais des fonctionnalités différenciantes gatées par plan.
    BillingModule,
    // Mission §63/§64/§65 — Public API rate-limited, par clé (voir ApiKeyThrottlerGuard). 100
    // requêtes/minute par défaut, décision d'implémentation documentée dans le rapport Sprint 16.
    ThrottlerModule.forRoot([{ name: "public-api", ttl: 60_000, limit: 100 }]),
  ],
  controllers: [ApiKeysController, WebhooksController, PublicTendersController, PublicResponsePackagesController],
  providers: [
    CreateApiKeyUseCase,
    ListApiKeysUseCase,
    RevokeApiKeyUseCase,
    AuthenticateApiKeyUseCase,

    CreateWebhookSubscriptionUseCase,
    UpdateWebhookSubscriptionUseCase,
    SetWebhookSubscriptionStatusUseCase,
    DeleteWebhookSubscriptionUseCase,
    ListWebhookSubscriptionsUseCase,
    GetWebhookSubscriptionUseCase,
    ListWebhookDeliveriesUseCase,
    RetryWebhookDeliveryUseCase,
    SendTestWebhookEventUseCase,

    DeliverWebhookService,
    WebhookDeliveryWorker,
    ApiKeyGuard,
    ApiKeyThrottlerGuard,

    { provide: API_KEY_REPOSITORY, useClass: PrismaApiKeyRepository },
    { provide: AUDIT_LOG_WRITER, useClass: PrismaAuditLogWriter },
  ],
})
export class IntegrationsModule {}
