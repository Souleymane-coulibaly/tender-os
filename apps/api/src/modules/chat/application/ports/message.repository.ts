import type { Message } from "../../domain/message.entity";
import type { MessageCitation } from "../../domain/message-citation.entity";

export interface MessageRepository {
  findById(input: { organizationId: string; messageId: string }): Promise<Message | null>;
  listByConversation(input: { organizationId: string; conversationId: string }): Promise<Message[]>;
  /** Utilisée par la garde anti-abus (mission décision §4) — vérifiée à l'intérieur de la même
   *  transaction courte que la création du nouveau message ASSISTANT `PENDING`. Doublée d'un index
   *  unique partiel en base (correctif audit Codex P2) : `save()` traduit une violation de cette
   *  contrainte en `ConversationGenerationInProgressError`, jamais une erreur Prisma brute. */
  findPendingByConversation(input: { organizationId: string; conversationId: string }): Promise<Message | null>;
  save(message: Message): Promise<void>;
  saveCitations(citations: readonly MessageCitation[]): Promise<void>;
  listCitationsByMessageId(input: { organizationId: string; messageId: string }): Promise<MessageCitation[]>;
  listCitationsByMessageIds(input: { organizationId: string; messageIds: readonly string[] }): Promise<MessageCitation[]>;
  /** Correctif audit Codex P1 (garde-fou volume IA, décision utilisateur) — verrou consultatif
   *  Postgres scopé à (organizationId, tenderId), tenu jusqu'à la fin de la transaction ambiante
   *  (même motif que `PrismaGenerationRepository.reserveForGenerating`) : DOIT être appelé avant
   *  `countBillableAssistantMessagesForTenderSince` dans la MÊME transaction courte que la création
   *  des messages, pour qu'aucune requête concurrente sur le même Tender ne puisse compter le même
   *  état "sous le plafond" avant qu'une autre n'ait committé sa propre consommation. */
  lockTenderQuota(input: { organizationId: string; tenderId: string }): Promise<void>;
  /** Compte les messages ASSISTANT "facturables OU réservés" d'un Tender depuis `since` (fenêtre
   *  glissante, jamais un jour calendaire — évite toute dépendance à un fuseau horaire non modélisé
   *  ici) :
   *  - `PENDING` — RÉSERVATION d'un appel provider sur le point d'être déclenché (correctif audit
   *    Codex round 2, P1 : le premier comptage ne voyait QUE `COMPLETED`/`FAILED`, laissant passer
   *    autant de requêtes concurrentes que de conversations différentes du même Tender tant
   *    qu'aucune n'était encore complétée — la garde ne réservait rien de réel). Compté DÈS la
   *    création du message, ENCORE DANS LA MÊME transaction courte que `lockTenderQuota`/le
   *    comptage lui-même (voir `SendMessageUseCase` Phase A) : aucune requête concurrente sur ce
   *    Tender ne peut plus se compter "sous le plafond" tant qu'un appel réservé n'est pas résolu.
   *  - `COMPLETED` — succès réel, appel réellement effectué et facturé.
   *  - `FAILED` AVEC un `model` renseigné — l'appel provider a bien été tenté (réseau, timeout, ou
   *    sortie/citations invalides APRÈS une réponse effectivement reçue), la réservation se
   *    confirme en "facturable".
   *  JAMAIS un `FAILED` SANS `model` (échec avant tout appel réseau : permission, provider non
   *  configuré, assemblage de contexte) — la réservation PENDING se libère naturellement dès que
   *  `Message.fail(errorMessage)` est appelé sans `model` (mission — règle explicite : un échec
   *  gratuit ne doit jamais consommer le quota, ni pendant qu'il est PENDING ni après résolution).
   */
  countBillableAssistantMessagesForTenderSince(input: { organizationId: string; tenderId: string; since: Date }): Promise<number>;

  /** Sprint 21 (hardening) — mission PARTIE F : un message ASSISTANT PENDING créé quand le process
   *  crashe avant `SendMessageUseCase.execute()`'s finalize (appel provider interrompu) bloque
   *  DÉFINITIVEMENT sa conversation (`findPendingByConversation` la retrouve pour toujours), sans
   *  aucun mécanisme de reprise existant jusqu'ici. Une seule tentative sans retry automatique
   *  (mission décision §1 — "synchrone, un seul aller-retour") : `createdAt` reste un signal fiable
   *  de fraîcheur (une ligne PENDING n'est jamais réutilisée pour une seconde tentative, contrairement
   *  à AnalysisJob/Generation), pas besoin d'une colonne `updatedAt` dédiée. */
  findStalePendingCandidates(input: { olderThan: Date; limit: number }): Promise<readonly { organizationId: string; messageId: string }[]>;
}

export const MESSAGE_REPOSITORY = Symbol("MESSAGE_REPOSITORY");
