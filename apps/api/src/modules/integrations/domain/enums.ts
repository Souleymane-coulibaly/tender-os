/** Mission §14/§21 — catalogue fermé, jamais un scope/statut arbitraire accepté à la création. */
export const ApiKeyScope = {
  TendersRead: "tenders:read",
  LotsRead: "lots:read",
  DocumentsRead: "documents:read",
  ChecklistRead: "checklist:read",
  TasksRead: "tasks:read",
  TasksWrite: "tasks:write",
  ResponsePackagesRead: "response-packages:read",
  WebhooksManage: "webhooks:manage",
} as const;
export type ApiKeyScope = (typeof ApiKeyScope)[keyof typeof ApiKeyScope];

export const API_KEY_SCOPES: readonly ApiKeyScope[] = Object.values(ApiKeyScope);

export function isApiKeyScope(value: string): value is ApiKeyScope {
  return (API_KEY_SCOPES as readonly string[]).includes(value);
}

export const WebhookSubscriptionStatus = {
  Active: "ACTIVE",
  Disabled: "DISABLED",
} as const;
export type WebhookSubscriptionStatus = (typeof WebhookSubscriptionStatus)[keyof typeof WebhookSubscriptionStatus];

/** Mission §35 "ou équivalent" — FAILED fusionné dans RETRYING/DEAD (jamais un état de repos
 *  distinct) : chaque tentative échouée décide immédiatement RETRYING (backoff) ou DEAD (max
 *  attempts atteint), jamais un troisième état intermédiaire persistant. */
export const WebhookDeliveryStatus = {
  Pending: "PENDING",
  Delivering: "DELIVERING",
  Succeeded: "SUCCEEDED",
  Retrying: "RETRYING",
  Dead: "DEAD",
} as const;
export type WebhookDeliveryStatus = (typeof WebhookDeliveryStatus)[keyof typeof WebhookDeliveryStatus];

/** Mission §42 — au-delà, DEAD (jamais un retry indéfini). */
export const WEBHOOK_DELIVERY_MAX_ATTEMPTS = 8;
