import { Inject, Injectable, Optional } from "@nestjs/common";
import { NoOutboxHandlerRegisteredError } from "../domain/errors";
import type { OutboxEventDispatcher, OutboxEventToDispatch } from "../application/ports/outbox-event-dispatcher";
import { OUTBOX_EVENT_HANDLERS, type OutboxEventHandler } from "../application/ports/outbox-event-handler";

/**
 * Correctif audit Codex P1-001/P1-002 — remplace `NoopOutboxEventDispatcher` : route chaque
 * événement vers le handler enregistré pour son `eventType`. Si aucun handler n'est enregistré
 * (cas normal du Sprint 1, aucun consommateur métier n'existe encore), l'événement n'est JAMAIS
 * marqué PUBLISHED — il suit le chemin d'échec/retry standard, jamais un faux succès silencieux.
 */
@Injectable()
export class CompositeOutboxEventDispatcher implements OutboxEventDispatcher {
  private readonly handlersByEventType: Map<string, OutboxEventHandler>;

  constructor(@Optional() @Inject(OUTBOX_EVENT_HANDLERS) handlers: OutboxEventHandler[] = []) {
    this.handlersByEventType = new Map(handlers.map((handler) => [handler.eventType, handler]));
  }

  async dispatch(event: OutboxEventToDispatch): Promise<void> {
    const handler = this.handlersByEventType.get(event.eventType);
    if (!handler) {
      throw new NoOutboxHandlerRegisteredError(event.eventType);
    }
    await handler.handle(event);
  }
}
