import type { Mention } from "../../domain/mention.entity";

export interface MentionRepository {
  listByComment(input: { organizationId: string; commentId: string }): Promise<Mention[]>;
  create(mention: Mention): Promise<void>;
}

export const MENTION_REPOSITORY = Symbol("MENTION_REPOSITORY");
