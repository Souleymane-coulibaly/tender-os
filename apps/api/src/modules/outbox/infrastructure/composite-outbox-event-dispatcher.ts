import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { NoOutboxHandlerRegisteredError } from "../domain/errors";
import type { OutboxEventDispatcher, OutboxEventToDispatch } from "../application/ports/outbox-event-dispatcher";
import { OUTBOX_EVENT_HANDLERS, type OutboxEventHandler } from "../application/ports/outbox-event-handler";
import { RecordEventProcessedByConsumerUseCase } from "../application/use-cases/record-event-processed-by-consumer.use-case";

/**
 * Correctif audit Codex P1-001/P1-002 — remplace `NoopOutboxEventDispatcher` : route chaque
 * événement vers le handler enregistré pour son `eventType`. Si aucun handler n'est enregistré
 * (cas normal du Sprint 1, aucun consommateur métier n'existe encore), l'événement n'est JAMAIS
 * marqué PUBLISHED — il suit le chemin d'échec/retry standard, jamais un faux succès silencieux.
 *
 * Sprint 21 (hardening) — mission PARTIE F/§(idempotence) : `RecordEventProcessedByConsumerUseCase`
 * existait depuis le Sprint 1 (garde contre la redélivraison "at-least-once" — un événement dont le
 * traitement dépasse `staleProcessingThresholdMs`, ou dont le worker crashe juste après, est
 * réclamé une seconde fois par `PublishPendingOutboxEventsUseCase` et redonné à CE dispatcher) mais
 * n'était jamais appelé nulle part : chaque redélivraison ré-exécutait intégralement l'effet de
 * bord (email envoyé deux fois, notification créée deux fois). Câblé ICI (point de routage UNIQUE,
 * commun à tous les handlers Notifications/Integrations) plutôt que dans chaque handler
 * individuellement — corrige le problème une fois pour tous les consommateurs présents et futurs.
 * `eventType` sert de `consumerName` : ce dispatcher garantit déjà une bijection eventType↔handler
 * (`Map<eventType, handler>`), donc un identifiant stable et unique par consommateur réel. Jamais
 * enregistré si `handler.handle()` échoue — la redélivraison doit rester possible pour un événement
 * réellement non traité.
 */
@Injectable()
export class CompositeOutboxEventDispatcher implements OutboxEventDispatcher {
  private readonly logger = new Logger(CompositeOutboxEventDispatcher.name);
  private readonly handlersByEventType: Map<string, OutboxEventHandler>;

  constructor(
    @Optional() @Inject(OUTBOX_EVENT_HANDLERS) handlers: OutboxEventHandler[] = [],
    private readonly recordEventProcessedByConsumerUseCase: RecordEventProcessedByConsumerUseCase,
  ) {
    this.handlersByEventType = new Map(handlers.map((handler) => [handler.eventType, handler]));
  }

  async dispatch(event: OutboxEventToDispatch): Promise<void> {
    const handler = this.handlersByEventType.get(event.eventType);
    if (!handler) {
      throw new NoOutboxHandlerRegisteredError(event.eventType);
    }

    const consumerName = event.eventType;
    const alreadyProcessed = await this.recordEventProcessedByConsumerUseCase.wasAlreadyProcessed({
      outboxEventId: event.id,
      consumerName,
    });
    if (alreadyProcessed) {
      this.logger.warn(`Outbox event ${event.id} (${event.eventType}) already processed by "${consumerName}" — skipping redelivered side effect.`);
      return;
    }

    await handler.handle(event);

    await this.recordEventProcessedByConsumerUseCase.execute({
      organizationId: event.organizationId,
      outboxEventId: event.id,
      consumerName,
    });
  }
}
