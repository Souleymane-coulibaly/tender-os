export type NotificationProps = {
  id: string;
  organizationId: string;
  userId: string;
  type: string;
  title: string;
  body?: string | undefined;
  targetUrl?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
  readAt?: Date | undefined;
  createdAt: Date;
};

/** Mission §37 — socle minimal, générique (`type` gouverne le producteur), un seul producteur ce
 *  sprint (`market-watch`, SavedSearchMatch). Jamais un système de notification "énorme" : pas de
 *  canal/priorité/expiration, juste lu/non-lu (mission §38). */
export class Notification {
  private constructor(private props: NotificationProps) {}

  static create(input: Omit<NotificationProps, "readAt" | "createdAt"> & { occurredAt: Date }): Notification {
    return new Notification({ ...input, createdAt: input.occurredAt });
  }

  static rehydrate(props: NotificationProps): Notification {
    return new Notification(props);
  }

  markRead(occurredAt: Date): void {
    this.props.readAt = occurredAt;
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get userId(): string {
    return this.props.userId;
  }
  get type(): string {
    return this.props.type;
  }
  get title(): string {
    return this.props.title;
  }
  get body(): string | undefined {
    return this.props.body;
  }
  get targetUrl(): string | undefined {
    return this.props.targetUrl;
  }
  get metadata(): Record<string, unknown> | undefined {
    return this.props.metadata;
  }
  get readAt(): Date | undefined {
    return this.props.readAt;
  }
  get isRead(): boolean {
    return this.props.readAt !== undefined;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
}
