import { Inject, Injectable } from "@nestjs/common";
import { PROCESSED_EVENT_REPOSITORY, type ProcessedEventRepository } from "../ports/processed-event.repository";

/**
 * Point d'entrée que les futurs consommateurs (Sprint 7+) appelleront après avoir traité un
 * événement avec succès — garantit qu'un rejeu (redelivery at-least-once) du même événement
 * pour le même consommateur ne produit jamais un second effet métier (mission Sprint 1 §2).
 */
@Injectable()
export class RecordEventProcessedByConsumerUseCase {
  constructor(@Inject(PROCESSED_EVENT_REPOSITORY) private readonly repository: ProcessedEventRepository) {}

  async execute(input: { organizationId: string; outboxEventId: string; consumerName: string; result?: string }): Promise<void> {
    await this.repository.recordProcessed(input);
  }

  async wasAlreadyProcessed(input: { outboxEventId: string; consumerName: string }): Promise<boolean> {
    return this.repository.wasProcessedBy(input);
  }
}
