import { Injectable } from "@nestjs/common";
import type { OutboxEventHandler, OutboxEventToDispatch } from "../../../outbox";
import { CreateWebhookDeliveriesForEventService } from "../../application/services/create-webhook-deliveries-for-event.service";

@Injectable()
export class TenderCreatedOutboxHandler implements OutboxEventHandler {
  readonly eventType = "TenderCreated";
  constructor(private readonly service: CreateWebhookDeliveriesForEventService) {}
  handle(event: OutboxEventToDispatch): Promise<void> {
    return this.service.handle(event);
  }
}
