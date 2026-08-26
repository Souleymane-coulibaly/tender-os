import type { NotificationCategory } from "../../domain/notification-category";
import type { NotificationPreference } from "../../domain/notification-preference.entity";

export interface NotificationPreferenceRepository {
  /** Toutes les préférences RÉELLEMENT persistées pour cet utilisateur (jamais un rang par
   *  catégorie manquante — le mergeage avec les valeurs par défaut vit dans le use case, jamais
   *  ici). */
  listByUser(userId: string): Promise<NotificationPreference[]>;
  findByUserAndCategory(input: { userId: string; category: NotificationCategory }): Promise<NotificationPreference | null>;
  /** Une seule ligne par (userId, category) — `upsert`, jamais un `create` qui échouerait sur une
   *  seconde modification de la même catégorie. */
  upsert(preference: NotificationPreference): Promise<void>;
}

export const NOTIFICATION_PREFERENCE_REPOSITORY = Symbol("NOTIFICATION_PREFERENCE_REPOSITORY");
