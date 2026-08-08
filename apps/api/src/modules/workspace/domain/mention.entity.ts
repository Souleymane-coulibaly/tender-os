export type MentionProps = {
  id: string;
  organizationId: string;
  commentId: string;
  mentionedUserId: string;
  createdAt: Date;
};

/** V2 Sprint 7 §22-23 — référence TOUJOURS un utilisateur réel (jamais un texte libre "@Jean"),
 *  validé par l'appelant contre un `TenderParticipant` actif du MÊME Tender que le commentaire
 *  AVANT toute création (mission §23) — aucune logique de validation ici, entité immuable une fois
 *  créée. */
export class Mention {
  private constructor(private props: MentionProps) {}

  static create(input: { id: string; organizationId: string; commentId: string; mentionedUserId: string; occurredAt: Date }): Mention {
    return new Mention({
      id: input.id,
      organizationId: input.organizationId,
      commentId: input.commentId,
      mentionedUserId: input.mentionedUserId,
      createdAt: input.occurredAt,
    });
  }

  static rehydrate(props: MentionProps): Mention {
    return new Mention(props);
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get commentId(): string {
    return this.props.commentId;
  }
  get mentionedUserId(): string {
    return this.props.mentionedUserId;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
}
