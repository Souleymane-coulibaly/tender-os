import { Inject, Injectable } from "@nestjs/common";
import type { NotificationCategory } from "../../domain/notification-category";
import { NOTIFICATION_PREFERENCE_REPOSITORY, type NotificationPreferenceRepository } from "../ports/notification-preference.repository";

export type IsCategoryEmailEnabledQuery = Readonly<{ userId: string; category: NotificationCategory }>;

/**
 * Checkpoint TENDEROS-2.1-P2.3-E11 — point de vérification UNIQUE réutilisé par les TROIS chemins
 * d'envoi email existants (`WorkspaceEventNotificationService`, `BillingEventNotificationService`,
 * `SendPendingEmailAlertsUseCase` de `market-watch`), jamais une logique de préférence dupliquée à
 * chaque appelant. Exportée par `NotificationsModule` précisément pour ce besoin cross-module
 * (mission §24 "aucun `new Resend(...)` dans un nouveau service E11" — ce use case ne touche jamais
 * lui-même à l'email, seulement à la décision "dois-je l'envoyer"). Absence de préférence
 * persistée = `true` (mission §28), même règle que `GetNotificationPreferencesUseCase`.
 */
@Injectable()
export class IsCategoryEmailEnabledUseCase {
  constructor(@Inject(NOTIFICATION_PREFERENCE_REPOSITORY) private readonly repository: NotificationPreferenceRepository) {}

  async execute(query: IsCategoryEmailEnabledQuery): Promise<boolean> {
    const preference = await this.repository.findByUserAndCategory(query);
    return preference?.emailEnabled ?? true;
  }
}
