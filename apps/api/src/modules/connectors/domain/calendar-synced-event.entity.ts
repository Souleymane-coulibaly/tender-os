export type CalendarSyncedEventProps = {
  id: string;
  organizationId: string;
  connectionId: string;
  tenderId: string;
  milestoneId?: string | undefined;
  externalEventId: string;
  createdBy: string;
  createdAt: Date;
  deletedAt?: Date | undefined;
};

/**
 * Mission §25/§34 — trace d'un événement calendrier créé depuis une échéance TenderOS. Conserve
 * `externalEventId` pour permettre une mise à jour/suppression propre côté provider plus tard, et
 * sert de garde anti-duplication : avant toute création, l'use-case vérifie l'absence d'une ligne
 * non supprimée pour le même (connectionId, tenderId, milestoneId) — jamais deux clics ne créent
 * deux événements distants (mission §34).
 */
export class CalendarSyncedEvent {
  private constructor(private props: CalendarSyncedEventProps) {}

  static create(input: { id: string; organizationId: string; connectionId: string; tenderId: string; milestoneId?: string | undefined; externalEventId: string; createdBy: string; occurredAt: Date }): CalendarSyncedEvent {
    return new CalendarSyncedEvent({
      id: input.id,
      organizationId: input.organizationId,
      connectionId: input.connectionId,
      tenderId: input.tenderId,
      milestoneId: input.milestoneId,
      externalEventId: input.externalEventId,
      createdBy: input.createdBy,
      createdAt: input.occurredAt,
    });
  }

  static rehydrate(props: CalendarSyncedEventProps): CalendarSyncedEvent {
    return new CalendarSyncedEvent(props);
  }

  softDelete(occurredAt: Date): void {
    this.props.deletedAt = occurredAt;
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get connectionId(): string {
    return this.props.connectionId;
  }
  get tenderId(): string {
    return this.props.tenderId;
  }
  get milestoneId(): string | undefined {
    return this.props.milestoneId;
  }
  get externalEventId(): string {
    return this.props.externalEventId;
  }
  get createdBy(): string {
    return this.props.createdBy;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get deletedAt(): Date | undefined {
    return this.props.deletedAt;
  }
}
