import { Injectable } from "@nestjs/common";
import type { OutboxEventHandler, OutboxEventToDispatch } from "../../../outbox";
import { CreateWebhookDeliveriesForEventService } from "../../application/services/create-webhook-deliveries-for-event.service";

/** V2 Sprint 17 — mission §65 "réutiliser l'Outbox Sprint 16, ne pas créer un second système". */
@Injectable()
export class ExternalTenderCreatedOutboxHandler implements OutboxEventHandler {
  readonly eventType = "external_tender.created";
  constructor(private readonly service: CreateWebhookDeliveriesForEventService) {}
  handle(event: OutboxEventToDispatch): Promise<void> {
    return this.service.handle(event);
  }
}
