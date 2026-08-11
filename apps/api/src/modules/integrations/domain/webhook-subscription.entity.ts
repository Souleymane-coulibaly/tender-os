import { WebhookSubscriptionStatus } from "./enums";

export type WebhookSubscriptionProps = {
  id: string;
  organizationId: string;
  endpointUrl: string;
  description?: string | undefined;
  events: readonly string[];
  secret: string;
  status: WebhookSubscriptionStatus;
  allowedClientAccountIds: readonly string[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | undefined;
};

export class WebhookSubscription {
  private constructor(private props: WebhookSubscriptionProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    endpointUrl: string;
    description?: string | undefined;
    events: readonly string[];
    secret: string;
    allowedClientAccountIds: readonly string[];
    createdBy: string;
    occurredAt: Date;
  }): WebhookSubscription {
    return new WebhookSubscription({
      id: input.id,
      organizationId: input.organizationId,
      endpointUrl: input.endpointUrl,
      description: input.description,
      events: input.events,
      secret: input.secret,
      status: WebhookSubscriptionStatus.Active,
      allowedClientAccountIds: input.allowedClientAccountIds,
      createdBy: input.createdBy,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: WebhookSubscriptionProps): WebhookSubscription {
    return new WebhookSubscription(props);
  }

  update(input: { endpointUrl?: string | undefined; description?: string | undefined; events?: readonly string[] | undefined; allowedClientAccountIds?: readonly string[] | undefined; occurredAt: Date }): void {
    if (input.endpointUrl !== undefined) this.props.endpointUrl = input.endpointUrl;
    if (input.description !== undefined) this.props.description = input.description;
    if (input.events !== undefined) this.props.events = input.events;
    if (input.allowedClientAccountIds !== undefined) this.props.allowedClientAccountIds = input.allowedClientAccountIds;
    this.props.updatedAt = input.occurredAt;
  }

  disable(occurredAt: Date): void {
    this.props.status = WebhookSubscriptionStatus.Disabled;
    this.props.updatedAt = occurredAt;
  }

  enable(occurredAt: Date): void {
    this.props.status = WebhookSubscriptionStatus.Active;
    this.props.updatedAt = occurredAt;
  }

  softDelete(occurredAt: Date): void {
    this.props.deletedAt = occurredAt;
    this.props.status = WebhookSubscriptionStatus.Disabled;
    this.props.updatedAt = occurredAt;
  }

  /** Mission §57 — DISABLED : aucune nouvelle delivery. Supprimée : idem. */
  get isEligibleForDelivery(): boolean {
    return this.props.status === WebhookSubscriptionStatus.Active && this.props.deletedAt === undefined;
  }

  isSubscribedTo(eventType: string): boolean {
    return this.props.events.includes(eventType);
  }

  /** Mission §18/§79 — même sémantique que `ApiKey.isClientAllowed` : liste vide = pas de
   *  restriction, sinon narrowing strict. */
  isClientAllowed(clientAccountId: string | undefined): boolean {
    if (this.props.allowedClientAccountIds.length === 0) return true;
    if (clientAccountId === undefined) return false;
    return this.props.allowedClientAccountIds.includes(clientAccountId);
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get endpointUrl(): string {
    return this.props.endpointUrl;
  }
  get description(): string | undefined {
    return this.props.description;
  }
  get events(): readonly string[] {
    return this.props.events;
  }
  get secret(): string {
    return this.props.secret;
  }
  get status(): WebhookSubscriptionStatus {
    return this.props.status;
  }
  get allowedClientAccountIds(): readonly string[] {
    return this.props.allowedClientAccountIds;
  }
  get createdBy(): string {
    return this.props.createdBy;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
  get deletedAt(): Date | undefined {
    return this.props.deletedAt;
  }
}
