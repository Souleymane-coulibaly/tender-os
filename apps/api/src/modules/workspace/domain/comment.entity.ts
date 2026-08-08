import { CommentDeletedError } from "./errors";

/** V2 Sprint 7 §19 — enum FERMÉ, jamais DOCUMENT ce sprint (réduction de périmètre assumée, voir
 *  plan). Chaque valeur doit avoir un résolveur dédié côté application (`comment-entity-resolver.ts`)
 *  vérifiant que `entityId` appartient bien au `tenderId`/`organizationId` du commentaire — jamais
 *  un `findUnique({id})` nu (mission §20). */
export const CommentEntityType = {
  Tender: "TENDER",
  Task: "TASK",
  ChecklistItem: "CHECKLIST_ITEM",
} as const;
export type CommentEntityType = (typeof CommentEntityType)[keyof typeof CommentEntityType];

export type CommentProps = {
  id: string;
  organizationId: string;
  tenderId: string;
  entityType: CommentEntityType;
  entityId: string;
  authorId: string;
  body: string;
  createdAt: Date;
  editedAt?: Date | undefined;
  deletedAt?: Date | undefined;
};

/** V2 Sprint 7 §19-21 — modèle générique GOUVERNÉ, même motif déjà éprouvé par
 *  `AiSuggestion.entityType`/`entityId`. Édition réservée à l'auteur (vérifié par l'appelant,
 *  mission §21), suppression toujours "soft" (préférée à la suppression physique). */
export class Comment {
  private constructor(private props: CommentProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    tenderId: string;
    entityType: CommentEntityType;
    entityId: string;
    authorId: string;
    body: string;
    occurredAt: Date;
  }): Comment {
    return new Comment({
      id: input.id,
      organizationId: input.organizationId,
      tenderId: input.tenderId,
      entityType: input.entityType,
      entityId: input.entityId,
      authorId: input.authorId,
      body: input.body,
      createdAt: input.occurredAt,
      editedAt: undefined,
      deletedAt: undefined,
    });
  }

  static rehydrate(props: CommentProps): Comment {
    return new Comment(props);
  }

  /** L'auteur (vérifié par l'appelant) peut modifier son propre commentaire (mission §21) — jamais
   *  une réécriture silencieuse : `editedAt` conserve la trace qu'une édition a eu lieu. */
  edit(body: string, occurredAt: Date): void {
    if (this.props.deletedAt !== undefined) {
      throw new CommentDeletedError();
    }
    this.props.body = body;
    this.props.editedAt = occurredAt;
  }

  softDelete(occurredAt: Date): void {
    if (this.props.deletedAt !== undefined) {
      throw new CommentDeletedError();
    }
    this.props.deletedAt = occurredAt;
  }

  get isDeleted(): boolean {
    return this.props.deletedAt !== undefined;
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
  get entityType(): CommentEntityType {
    return this.props.entityType;
  }
  get entityId(): string {
    return this.props.entityId;
  }
  get authorId(): string {
    return this.props.authorId;
  }
  get body(): string {
    return this.props.body;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get editedAt(): Date | undefined {
    return this.props.editedAt;
  }
  get deletedAt(): Date | undefined {
    return this.props.deletedAt;
  }
}
