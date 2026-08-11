import { Inject, Injectable, Logger } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import type { OutboxEventToDispatch } from "../../../outbox";
import { WebhookDelivery } from "../../domain/webhook-delivery.entity";
import { extractClientAccountIdHint, resolvePublicEventType } from "../../domain/event-catalog";
import { WEBHOOK_DELIVERY_REPOSITORY, type WebhookDeliveryRepository } from "../ports/webhook-delivery.repository";
import { WEBHOOK_SUBSCRIPTION_REPOSITORY, type WebhookSubscriptionRepository } from "../ports/webhook-subscription.repository";

/**
 * Mission §38/§91/§92/§134 — POINT DE FERMETURE DE LA BOUCLE : c'est CE service, invoqué par
 * chaque handler Outbox enregistré (voir infrastructure/outbox-handlers/), qui transforme un
 * OutboxEvent claimé (déjà committé, mission §92 "jamais avant commit métier") en zéro ou
 * plusieurs `WebhookDelivery` réellement persistées — la seule étape qui manquait dans ce dépôt
 * depuis Sprint 1 (aucun `OutboxEventHandler` n'était jamais enregistré, voir audit Sprint 16).
 *
 * Idempotent par construction (mission §44/§90/§115) : `createIfNotExists` s'appuie sur
 * `UNIQUE(subscriptionId, eventId)` — un même OutboxEvent re-traité après un échec partiel du
 * dispatcher ne crée jamais de deliveries dupliquées.
 *
 * Délibérément AUTONOME (aucune dépendance vers `TendersModule`/`TENDER_REPOSITORY`, voir
 * `IntegrationEventConsumersModule` — casser cette frontière recréerait un cycle de modules avec
 * `OutboxModule`). Conséquence assumée : le filtrage par client d'une `WebhookSubscription`
 * restreinte ne fonctionne que pour les événements dont le payload porte déjà `clientAccountId`
 * (voir `resolvePublicEventType`/producteurs) — documenté dans le rapport Sprint 16.
 */
@Injectable()
export class CreateWebhookDeliveriesForEventService {
  private readonly logger = new Logger(CreateWebhookDeliveriesForEventService.name);

  constructor(
    @Inject(WEBHOOK_SUBSCRIPTION_REPOSITORY) private readonly subscriptionRepository: WebhookSubscriptionRepository,
    @Inject(WEBHOOK_DELIVERY_REPOSITORY) private readonly deliveryRepository: WebhookDeliveryRepository,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async handle(event: OutboxEventToDispatch): Promise<void> {
    const publicType = resolvePublicEventType(event.eventType, event.payload);
    if (!publicType) {
      // Mission §26 — pas tous les événements internes n'ont un équivalent public ; ce n'est PAS
      // une erreur, ce handler n'est simplement enregistré que pour les eventType qu'il sait
      // traduire (voir infrastructure/outbox-handlers/).
      return;
    }

    const subscriptions = await this.subscriptionRepository.listActiveByOrganizationAndEventType({ organizationId: event.organizationId, eventType: publicType });
    if (subscriptions.length === 0) {
      return;
    }

    const clientAccountId = extractClientAccountIdHint(event.payload);

    const webhookPayload = {
      id: event.id,
      type: publicType,
      version: event.eventVersion,
      occurredAt: event.occurredAt.toISOString(),
      organizationId: event.organizationId,
      data: event.payload,
    };

    for (const subscription of subscriptions) {
      if (!subscription.isClientAllowed(clientAccountId)) {
        continue; // mission §79 — filtre client respecté AVANT émission.
      }

      const delivery = WebhookDelivery.create({
        id: this.idGenerator.generate(),
        organizationId: event.organizationId,
        subscriptionId: subscription.id,
        eventId: event.id,
        eventType: publicType,
        payload: webhookPayload,
        occurredAt: this.clock.now(),
      });

      const created = await this.deliveryRepository.createIfNotExists(delivery);
      if (created) {
        this.logger.log(`WebhookDelivery queued: subscription=${subscription.id} event=${event.id} type=${publicType}`);
      }
    }
  }
}
