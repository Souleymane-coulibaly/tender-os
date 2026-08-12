import type { Comment, CommentEntityType } from "../../domain/comment.entity";
import type { Mention } from "../../domain/mention.entity";

export interface CommentRepository {
  findById(input: { organizationId: string; commentId: string }): Promise<Comment | null>;
  /** Correctif audit — `tenderId` est un filtre obligatoire, jamais seulement `entityType`+`entityId` :
   *  sans lui, un acteur autorisé sur le Tender A pouvait lire les commentaires d'une entité d'un
   *  AUTRE Tender/client de la même organisation en devinant/connaissant son UUID. */
  listByEntity(input: { organizationId: string; tenderId: string; entityType: CommentEntityType; entityId: string }): Promise<Comment[]>;
  listByTender(input: { organizationId: string; tenderId: string }): Promise<Comment[]>;
  /** V2 Sprint 7 §47 — écrit le commentaire ET ses mentions dans UNE SEULE transaction Postgres
   *  (jamais l'un sans l'autre). Seul point d'écriture pour la CRÉATION d'un commentaire. */
  createWithMentions(comment: Comment, mentions: readonly Mention[]): Promise<void>;
  /** Édition/suppression douce — un commentaire déjà créé n'a plus de mentions à écrire. */
  save(comment: Comment): Promise<void>;
}

export const COMMENT_REPOSITORY = Symbol("COMMENT_REPOSITORY");
