import { Inject, Injectable } from "@nestjs/common";
import { MESSAGE_REPOSITORY, type MessageRepository } from "../ports/message.repository";

/**
 * V2 Sprint 22 (billing, étape 22D) — vue en LECTURE consommée par l'écran "Abonnement &
 * utilisation" (mission §44) et Platform Admin, réexportée en LECTURE SEULE pour `billing` — jamais
 * le même compteur que la garde anti-abus par Tender (`countBillableAssistantMessagesForTenderSince`,
 * fenêtre glissante 24h) : ici organisation-wide, depuis le début du jour calendaire de l'appelant.
 */
@Injectable()
export class CountTodayChatUsageForOrganizationUseCase {
  constructor(@Inject(MESSAGE_REPOSITORY) private readonly messageRepository: MessageRepository) {}

  async execute(input: { organizationId: string; since: Date }): Promise<number> {
    return this.messageRepository.countAssistantMessagesForOrganizationSince(input);
  }
}
