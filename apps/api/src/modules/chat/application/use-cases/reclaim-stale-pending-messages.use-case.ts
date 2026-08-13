import { Inject, Injectable, Logger } from "@nestjs/common";
import { MESSAGE_REPOSITORY, type MessageRepository } from "../ports/message.repository";
import { MessageStatus } from "../../domain/message.entity";

export type ReclaimStalePendingMessagesInput = Readonly<{ staleThresholdMs: number; batchSize: number }>;
export type ReclaimStalePendingMessagesResult = Readonly<{ reclaimed: number }>;

/**
 * Sprint 21 (hardening) — mission PARTIE F : sans ce use case, un message ASSISTANT PENDING créé
 * juste avant un crash process (l'appel provider n'a jamais résolu) bloque DÉFINITIVEMENT sa
 * conversation — `findPendingByConversation` la retrouve pour toujours, `SendMessageUseCase`
 * refuse tout nouvel envoi (`ConversationGenerationInProgressError`), sans aucun mécanisme de
 * reprise, automatique ou manuel. Contrairement à AnalysisJob/Generation, Chat est synchrone à
 * usage unique (mission décision §1) : jamais de re-dispatch, le message reclaimé passe
 * directement à FAILED — l'utilisateur renvoie sa question s'il le souhaite (un nouveau message,
 * jamais une reprise invisible de l'ancien).
 */
@Injectable()
export class ReclaimStalePendingMessagesUseCase {
  private readonly logger = new Logger(ReclaimStalePendingMessagesUseCase.name);

  constructor(@Inject(MESSAGE_REPOSITORY) private readonly messageRepository: MessageRepository) {}

  async execute(input: ReclaimStalePendingMessagesInput): Promise<ReclaimStalePendingMessagesResult> {
    const olderThan = new Date(Date.now() - input.staleThresholdMs);
    const candidates = await this.messageRepository.findStalePendingCandidates({ olderThan, limit: input.batchSize });

    let reclaimed = 0;
    for (const candidate of candidates) {
      try {
        const message = await this.messageRepository.findById(candidate);
        if (!message || message.status !== MessageStatus.Pending) {
          continue;
        }
        // Jamais de `model` — aucun appel provider n'a nécessairement été tenté (ou sa réponse
        // n'est jamais revenue) : reste dans la catégorie "échec gratuit" (voir la docstring de
        // `countBillableAssistantMessagesForTenderSince`), jamais compté comme facturable.
        message.fail("The assistant did not respond in time — this attempt was automatically abandoned. Please try again.");
        await this.messageRepository.save(message);
        reclaimed += 1;
        this.logger.warn(`Reclaimed stale PENDING message ${candidate.messageId} (unblocking its conversation).`);
      } catch (error) {
        this.logger.error(
          `Failed to reclaim message ${candidate.messageId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return { reclaimed };
  }
}
