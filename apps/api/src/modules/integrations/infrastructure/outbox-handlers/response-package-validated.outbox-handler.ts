import { Injectable } from "@nestjs/common";
import type { OutboxEventHandler, OutboxEventToDispatch } from "../../../outbox";
import { CreateWebhookDeliveriesForEventService } from "../../application/services/create-webhook-deliveries-for-event.service";

/** Mission §135 SCENARIO A — le maillon "Response Package validé -> TenderOS émet
 *  response_package.validated" du scénario de démonstration exigé par la mission. */
@Injectable()
export class ResponsePackageValidatedOutboxHandler implements OutboxEventHandler {
  readonly eventType = "response_package.validated";
  constructor(private readonly service: CreateWebhookDeliveriesForEventService) {}
  handle(event: OutboxEventToDispatch): Promise<void> {
    return this.service.handle(event);
  }
}
