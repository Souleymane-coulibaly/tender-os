import type { NotificationCategory } from "./notification-category";

export type NotificationPreferenceProps = {
  id: string;
  userId: string;
  category: NotificationCategory;
  emailEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Checkpoint TENDEROS-2.1-P2.3-E11 (Notifications V2) — préférence PERSONNELLE (jamais liée à une
 * organisation, mission §21/§30 "même préférence quelle que soit l'organisation courante"). Seule
 * l'email est configurable (mission §20/§22) : l'in-app reste toujours actif pour les événements
 * produit pertinents, jamais un second toggle qui désactiverait silencieusement une notification
 * in-app potentiellement critique. Absence de ligne persistée = `emailEnabled: true` par défaut,
 * décidée et appliquée par `GetNotificationPreferencesUseCase`/`IsCategoryEmailEnabledUseCase`,
 * jamais devinée ici (cette classe ne représente qu'une préférence RÉELLEMENT persistée).
 */
export class NotificationPreference {
  private constructor(private props: NotificationPreferenceProps) {}

  static create(input: { id: string; userId: string; category: NotificationCategory; emailEnabled: boolean; occurredAt: Date }): NotificationPreference {
    return new NotificationPreference({ id: input.id, userId: input.userId, category: input.category, emailEnabled: input.emailEnabled, createdAt: input.occurredAt, updatedAt: input.occurredAt });
  }

  static rehydrate(props: NotificationPreferenceProps): NotificationPreference {
    return new NotificationPreference(props);
  }

  setEmailEnabled(emailEnabled: boolean, occurredAt: Date): void {
    this.props.emailEnabled = emailEnabled;
    this.props.updatedAt = occurredAt;
  }

  get id(): string {
    return this.props.id;
  }
  get userId(): string {
    return this.props.userId;
  }
  get category(): NotificationCategory {
    return this.props.category;
  }
  get emailEnabled(): boolean {
    return this.props.emailEnabled;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
