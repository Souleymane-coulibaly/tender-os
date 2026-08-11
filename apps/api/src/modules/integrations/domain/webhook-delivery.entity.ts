import { WebhookDeliveryStatus } from "./enums";
import { computeWebhookDeliveryBackoffSeconds, hasReachedMaxAttempts, isRetryableDeliveryOutcome } from "./services/webhook-retry-policy";

export type WebhookDeliveryProps = {
  id: string;
  organizationId: string;
  subscriptionId: string;
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  status: WebhookDeliveryStatus;
  attemptCount: number;
  httpStatus?: number | undefined;
  startedAt?: Date | undefined;
  completedAt?: Date | undefined;
  nextAvailableAt: Date;
  errorSummary?: string | undefined;
  createdAt: Date;
};

/** Mission §33/§35/§40/§42/§44 — une ligne par (subscription, event), transitions PENDING ->
 *  DELIVERING -> SUCCEEDED | RETRYING | DEAD, jamais un état de repos supplémentaire. */
export class WebhookDelivery {
  private constructor(private props: WebhookDeliveryProps) {}

  static create(input: { id: string; organizationId: string; subscriptionId: string; eventId: string; eventType: string; payload: Record<string, unknown>; occurredAt: Date }): WebhookDelivery {
    return new WebhookDelivery({
      id: input.id,
      organizationId: input.organizationId,
      subscriptionId: input.subscriptionId,
      eventId: input.eventId,
      eventType: input.eventType,
      payload: input.payload,
      status: WebhookDeliveryStatus.Pending,
      attemptCount: 0,
      nextAvailableAt: input.occurredAt,
      createdAt: input.occurredAt,
    });
  }

  static rehydrate(props: WebhookDeliveryProps): WebhookDelivery {
    return new WebhookDelivery(props);
  }

  markDelivering(occurredAt: Date): void {
    this.props.status = WebhookDeliveryStatus.Delivering;
    this.props.startedAt = occurredAt;
  }

  markSucceeded(input: { httpStatus: number; occurredAt: Date }): void {
    this.props.status = WebhookDeliveryStatus.Succeeded;
    this.props.httpStatus = input.httpStatus;
    this.props.completedAt = input.occurredAt;
    this.props.errorSummary = undefined;
  }

  /** Mission §40/§41/§42 — décide RETRYING (avec backoff) ou DEAD selon la policy + le nombre de
   *  tentatives déjà effectuées, jamais un troisième état intermédiaire persistant. */
  recordFailure(input: { httpStatus?: number | undefined; isNetworkOrTimeoutError: boolean; errorSummary: string; occurredAt: Date }): void {
    this.props.attemptCount += 1;
    this.props.httpStatus = input.httpStatus;
    this.props.errorSummary = input.errorSummary.slice(0, 500);

    const retryable = isRetryableDeliveryOutcome({ httpStatus: input.httpStatus, isNetworkOrTimeoutError: input.isNetworkOrTimeoutError });
    if (!retryable || hasReachedMaxAttempts(this.props.attemptCount)) {
      this.props.status = WebhookDeliveryStatus.Dead;
      this.props.completedAt = input.occurredAt;
      return;
    }

    this.props.status = WebhookDeliveryStatus.Retrying;
    const backoffSeconds = computeWebhookDeliveryBackoffSeconds(this.props.attemptCount);
    this.props.nextAvailableAt = new Date(input.occurredAt.getTime() + backoffSeconds * 1000);
  }

  /** Mission §43 — reprise manuelle : remet en file d'attente immédiate, réservée à un acteur
   *  autorisé (vérifié par l'appelant, pas ici). */
  scheduleManualRetry(occurredAt: Date): void {
    this.props.status = WebhookDeliveryStatus.Pending;
    this.props.nextAvailableAt = occurredAt;
    this.props.errorSummary = undefined;
  }

  get isRetryableNow(): boolean {
    return this.props.status === WebhookDeliveryStatus.Retrying || this.props.status === WebhookDeliveryStatus.Dead;
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get subscriptionId(): string {
    return this.props.subscriptionId;
  }
  get eventId(): string {
    return this.props.eventId;
  }
  get eventType(): string {
    return this.props.eventType;
  }
  get payload(): Record<string, unknown> {
    return this.props.payload;
  }
  get status(): WebhookDeliveryStatus {
    return this.props.status;
  }
  get attemptCount(): number {
    return this.props.attemptCount;
  }
  get httpStatus(): number | undefined {
    return this.props.httpStatus;
  }
  get startedAt(): Date | undefined {
    return this.props.startedAt;
  }
  get completedAt(): Date | undefined {
    return this.props.completedAt;
  }
  get nextAvailableAt(): Date {
    return this.props.nextAvailableAt;
  }
  get errorSummary(): string | undefined {
    return this.props.errorSummary;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
}
