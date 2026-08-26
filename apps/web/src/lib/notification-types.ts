/** Checkpoint TENDEROS-2.1-P2.3-E11 (Notifications V2) — miroir frontend de `NotificationCategory`
 *  (API, module `notifications`) : les TROIS catégories réellement câblées au pipeline Outbox
 *  existant (E10 pour Market Watch, Sprint 18/22 pour Collaboration/Billing), jamais une catégorie
 *  inventée côté frontend. */
export const NOTIFICATION_CATEGORIES = ["MARKET_WATCH", "COLLABORATION", "BILLING"] as const;
export type NotificationCategoryId = (typeof NOTIFICATION_CATEGORIES)[number];

export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategoryId, string> = {
  MARKET_WATCH: "Veille",
  COLLABORATION: "Collaboration",
  BILLING: "Compte & facturation",
};

export const NOTIFICATION_CATEGORY_DESCRIPTIONS: Record<NotificationCategoryId, string> = {
  MARKET_WATCH: "Nouvelles opportunités correspondant à vos veilles.",
  COLLABORATION: "Mentions, tâches assignées et demandes de validation.",
  BILLING: "Changements de forfait, essai, paiement et crédits AO.",
};

export type NotificationPreferenceSummary = Readonly<{ category: NotificationCategoryId; emailEnabled: boolean }>;

/** Mission §14 — mappe chaque `Notification.type` réel (API) à sa catégorie de préférence, pour
 *  afficher une icône/couleur cohérente dans le centre de notifications. Toute valeur non listée
 *  ici (type futur non encore catégorisé) retombe sur un badge neutre générique, jamais une erreur. */
const TYPE_PREFIXES: Array<{ prefix: string; category: NotificationCategoryId }> = [
  { prefix: "SAVED_SEARCH_", category: "MARKET_WATCH" },
  { prefix: "WORKSPACE_", category: "COLLABORATION" },
  { prefix: "BILLING_", category: "BILLING" },
];

export function categoryForNotificationType(type: string): NotificationCategoryId | undefined {
  return TYPE_PREFIXES.find((entry) => type.startsWith(entry.prefix))?.category;
}
