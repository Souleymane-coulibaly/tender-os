import { Module } from "@nestjs/common";
import { WEBHOOK_DELIVERY_REPOSITORY } from "./application/ports/webhook-delivery.repository";
import { WEBHOOK_SUBSCRIPTION_REPOSITORY } from "./application/ports/webhook-subscription.repository";
import { CreateWebhookDeliveriesForEventService } from "./application/services/create-webhook-deliveries-for-event.service";
import { ExternalTenderCreatedOutboxHandler } from "./infrastructure/outbox-handlers/external-tender-created.outbox-handler";
import { ExternalTenderUpdatedOutboxHandler } from "./infrastructure/outbox-handlers/external-tender-updated.outbox-handler";
import { GoNoGoDecisionRecordedOutboxHandler } from "./infrastructure/outbox-handlers/go-no-go-decision-recorded.outbox-handler";
import { NotificationCreatedOutboxHandler } from "./infrastructure/outbox-handlers/notification-created.outbox-handler";
import { ResponsePackageGeneratedOutboxHandler } from "./infrastructure/outbox-handlers/response-package-generated.outbox-handler";
import { ResponsePackageValidatedOutboxHandler } from "./infrastructure/outbox-handlers/response-package-validated.outbox-handler";
import { SavedSearchMatchFoundOutboxHandler } from "./infrastructure/outbox-handlers/saved-search-match-found.outbox-handler";
import { TaskCompletedOutboxHandler } from "./infrastructure/outbox-handlers/task-completed.outbox-handler";
import { TaskCreatedOutboxHandler } from "./infrastructure/outbox-handlers/task-created.outbox-handler";
import { TenderCreatedOutboxHandler } from "./infrastructure/outbox-handlers/tender-created.outbox-handler";
import { PrismaWebhookDeliveryRepository } from "./infrastructure/prisma-webhook-delivery.repository";
import { PrismaWebhookSubscriptionRepository } from "./infrastructure/prisma-webhook-subscription.repository";

/** Les handlers Outbox réellement enregistrés (mission §22 Sprint 16, catalogue volontairement
 *  restreint ; +4 V2 Sprint 17 mission §65 "réutiliser l'Outbox, jamais un second système") — voir
 *  `event-catalog.ts`. */
export const INTEGRATION_OUTBOX_HANDLERS = [
  TenderCreatedOutboxHandler,
  TaskCreatedOutboxHandler,
  TaskCompletedOutboxHandler,
  GoNoGoDecisionRecordedOutboxHandler,
  ResponsePackageValidatedOutboxHandler,
  ResponsePackageGeneratedOutboxHandler,
  ExternalTenderCreatedOutboxHandler,
  ExternalTenderUpdatedOutboxHandler,
  SavedSearchMatchFoundOutboxHandler,
  NotificationCreatedOutboxHandler,
];

/**
 * V2 Sprint 16 (Integration Hub) — module MINIMAL et délibérément AUTONOME (aucune dépendance vers
 * Tenders/ResponsePackage/ClientPortfolio/OutboxModule), uniquement pour être importé par
 * `OutboxModule.forRoot(...)` (app.module.ts) sans créer de cycle : Tenders/Workspace/Opportunity/
 * ResponsePackage importent tous `OutboxModule` (pour `OUTBOX_WRITER`) — si `OutboxModule.forRoot`
 * importait un module qui importe LUI-MÊME l'un de ces producteurs, la boucle se refermerait
 * (`OutboxModule -> ... -> OutboxModule`). `IntegrationsModule` (le module complet, CRUD API
 * Keys/Webhooks + Public API) importe CE module pour réutiliser ses repositories, jamais
 * l'inverse.
 *
 * Limitation assumée (voir rapport Sprint 16 §"risques résiduels") : `CreateWebhookDeliveriesForEventService`
 * ne résout PAS `tenderId -> clientAccountId` (cela exigerait `TENDER_REPOSITORY`, donc
 * `TendersModule`, qui importe `OutboxModule` — même cycle). Le filtrage par client d'une
 * `WebhookSubscription` restreinte fonctionne donc uniquement pour les événements dont le payload
 * porte déjà `clientAccountId` (tender.created, response_package.validated/generated) — les
 * événements task.* et opportunity.* ne sont jamais filtrés par client (livrés à toute
 * subscription NON restreinte, jamais à une restreinte, conformément à la règle "jamais un envoi
 * risqué faute de certitude").
 */
@Module({
  providers: [
    CreateWebhookDeliveriesForEventService,
    ...INTEGRATION_OUTBOX_HANDLERS,
    { provide: WEBHOOK_SUBSCRIPTION_REPOSITORY, useClass: PrismaWebhookSubscriptionRepository },
    { provide: WEBHOOK_DELIVERY_REPOSITORY, useClass: PrismaWebhookDeliveryRepository },
  ],
  exports: [CreateWebhookDeliveriesForEventService, WEBHOOK_SUBSCRIPTION_REPOSITORY, WEBHOOK_DELIVERY_REPOSITORY, ...INTEGRATION_OUTBOX_HANDLERS],
})
export class IntegrationEventConsumersModule {}
