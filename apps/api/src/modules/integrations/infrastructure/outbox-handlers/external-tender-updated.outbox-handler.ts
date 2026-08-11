import { Injectable } from "@nestjs/common";
import type { OutboxEventHandler, OutboxEventToDispatch } from "../../../outbox";
import { CreateWebhookDeliveriesForEventService } from "../../application/services/create-webhook-deliveries-for-event.service";

/** V2 Sprint 17 — mission §65. */
@Injectable()
export class ExternalTenderUpdatedOutboxHandler implements OutboxEventHandler {
  readonly eventType = "external_tender.updated";
  constructor(private readonly service: CreateWebhookDeliveriesForEventService) {}
  handle(event: OutboxEventToDispatch): Promise<void> {
    return this.service.handle(event);
  }
}
