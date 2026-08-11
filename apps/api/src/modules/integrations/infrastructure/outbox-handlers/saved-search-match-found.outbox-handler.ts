import { Injectable } from "@nestjs/common";
import type { OutboxEventHandler, OutboxEventToDispatch } from "../../../outbox";
import { CreateWebhookDeliveriesForEventService } from "../../application/services/create-webhook-deliveries-for-event.service";

/** V2 Sprint 17 — mission §65. */
@Injectable()
export class SavedSearchMatchFoundOutboxHandler implements OutboxEventHandler {
  readonly eventType = "saved_search.match_found";
  constructor(private readonly service: CreateWebhookDeliveriesForEventService) {}
  handle(event: OutboxEventToDispatch): Promise<void> {
    return this.service.handle(event);
  }
}
