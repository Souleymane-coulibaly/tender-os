import { Injectable } from "@nestjs/common";
import type { OutboxEventHandler, OutboxEventToDispatch } from "../../../outbox";
import { CreateWebhookDeliveriesForEventService } from "../../application/services/create-webhook-deliveries-for-event.service";

@Injectable()
export class ResponsePackageGeneratedOutboxHandler implements OutboxEventHandler {
  readonly eventType = "response_package.generated";
  constructor(private readonly service: CreateWebhookDeliveriesForEventService) {}
  handle(event: OutboxEventToDispatch): Promise<void> {
    return this.service.handle(event);
  }
}
