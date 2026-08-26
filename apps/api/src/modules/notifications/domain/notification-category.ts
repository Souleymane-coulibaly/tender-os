/**
 * Checkpoint TENDEROS-2.1-P2.3-E11 (Notifications V2) — les TROIS catégories réellement couvertes
 * par le pipeline Outbox existant (audité avant toute écriture, mission §0) : jamais une catégorie
 * inventée sans producteur réel derrière. `MARKET_WATCH` (SavedSearchMatch, E10), `COLLABORATION`
 * (mention/assignation/validation, `WorkspaceEventNotificationService`), `BILLING` (plan/trial/
 * paiement, `BillingEventNotificationService`) — voir `notification-preference.ts` pour l'usage.
 */
export const NotificationCategory = {
  MarketWatch: "MARKET_WATCH",
  Collaboration: "COLLABORATION",
  Billing: "BILLING",
} as const;

export type NotificationCategory = (typeof NotificationCategory)[keyof typeof NotificationCategory];

export const NOTIFICATION_CATEGORIES: readonly NotificationCategory[] = Object.values(NotificationCategory);

export function isNotificationCategory(value: string): value is NotificationCategory {
  return (NOTIFICATION_CATEGORIES as readonly string[]).includes(value);
}
