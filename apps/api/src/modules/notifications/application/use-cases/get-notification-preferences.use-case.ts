import { Inject, Injectable } from "@nestjs/common";
import { NOTIFICATION_CATEGORIES, type NotificationCategory } from "../../domain/notification-category";
import { NOTIFICATION_PREFERENCE_REPOSITORY, type NotificationPreferenceRepository } from "../ports/notification-preference.repository";

export type NotificationPreferenceSummary = Readonly<{ category: NotificationCategory; emailEnabled: boolean }>;

/**
 * Checkpoint TENDEROS-2.1-P2.3-E11 — retourne TOUJOURS l'ensemble complet des catégories connues
 * (mission §28 "jamais un état ambigu"), jamais seulement les lignes réellement persistées : une
 * catégorie sans préférence explicite vaut `emailEnabled: true` (comportement historique
 * inchangé — introduire les préférences ne doit jamais couper silencieusement un email qui partait
 * déjà avant ce Checkpoint).
 */
@Injectable()
export class GetNotificationPreferencesUseCase {
  constructor(@Inject(NOTIFICATION_PREFERENCE_REPOSITORY) private readonly repository: NotificationPreferenceRepository) {}

  async execute(input: { userId: string }): Promise<NotificationPreferenceSummary[]> {
    const rows = await this.repository.listByUser(input.userId);
    const byCategory = new Map(rows.map((row) => [row.category, row]));
    return NOTIFICATION_CATEGORIES.map((category) => ({ category, emailEnabled: byCategory.get(category)?.emailEnabled ?? true }));
  }
}
