export type ConversationProps = {
  id: string;
  organizationId: string;
  tenderId: string;
  /** Dénormalisé depuis `Tender.clientAccountId` AU MOMENT de la création (mission §5, même motif
   *  d'immutabilité que `KnowledgeEntry.clientAccountId`, Sprint 8) — jamais modifié ensuite, y
   *  compris si le Tender change de candidat par la suite. */
  clientAccountId?: string | undefined;
  /** Simple filtre optionnel (scalaire, jamais une FK stricte) — revérifié applicativement
   *  (appartenance au même Tender) à chaque usage, jamais fait confiance en base. */
  lotId?: string | undefined;
  createdByUserId: string;
  title?: string | undefined;
  createdAt: Date;
  updatedAt: Date;
  archivedAt?: Date | undefined;
};

/** V2 Sprint 9 (Chat IA conversationnel) — une Conversation appartient TOUJOURS à EXACTEMENT UN
 *  Tender, jamais réaffectable (mission §5 "ne jamais permettre de changer silencieusement de
 *  Tender") : aucune méthode de cette classe ne modifie `tenderId`/`clientAccountId`. */
export class Conversation {
  private constructor(private props: ConversationProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    tenderId: string;
    clientAccountId?: string | undefined;
    lotId?: string | undefined;
    createdByUserId: string;
    title?: string | undefined;
    occurredAt: Date;
  }): Conversation {
    return new Conversation({
      id: input.id,
      organizationId: input.organizationId,
      tenderId: input.tenderId,
      clientAccountId: input.clientAccountId,
      lotId: input.lotId,
      createdByUserId: input.createdByUserId,
      title: input.title,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
      archivedAt: undefined,
    });
  }

  static rehydrate(props: ConversationProps): Conversation {
    return new Conversation(props);
  }

  touch(occurredAt: Date): void {
    this.props.updatedAt = occurredAt;
  }

  archive(occurredAt: Date): void {
    this.props.archivedAt = occurredAt;
    this.props.updatedAt = occurredAt;
  }

  get isArchived(): boolean {
    return this.props.archivedAt !== undefined;
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get tenderId(): string {
    return this.props.tenderId;
  }
  get clientAccountId(): string | undefined {
    return this.props.clientAccountId;
  }
  get lotId(): string | undefined {
    return this.props.lotId;
  }
  get createdByUserId(): string {
    return this.props.createdByUserId;
  }
  get title(): string | undefined {
    return this.props.title;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
  get archivedAt(): Date | undefined {
    return this.props.archivedAt;
  }
}
