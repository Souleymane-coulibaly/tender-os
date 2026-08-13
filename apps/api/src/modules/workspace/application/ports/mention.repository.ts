import type { Mention } from "../../domain/mention.entity";

export interface MentionRepository {
  listByComment(input: { organizationId: string; commentId: string }): Promise<Mention[]>;
  /** Sprint 21 (hardening) — mission §26 (N+1) : `ListCommentsUseCase` appelait `listByComment` une
   *  fois PAR commentaire (une requête par ligne, jamais groupée). Une seule requête `IN (...)`,
   *  résultat regroupé par `commentId` côté appelant. */
  listByComments(input: { organizationId: string; commentIds: readonly string[] }): Promise<Mention[]>;
  create(mention: Mention): Promise<void>;
}

export const MENTION_REPOSITORY = Symbol("MENTION_REPOSITORY");
