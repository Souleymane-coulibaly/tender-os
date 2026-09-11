import type { BadgeTone } from "../components/ui";

export const API_KEY_SCOPES = [
  "tenders:read",
  "lots:read",
  "documents:read",
  "checklist:read",
  "tasks:read",
  "tasks:write",
  "response-packages:read",
  "webhooks:manage",
] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export const API_KEY_SCOPE_LABELS: Record<ApiKeyScope, string> = {
  "tenders:read": "Appels d'offres — lecture",
  "lots:read": "Lots — lecture",
  "documents:read": "Documents — lecture",
  "checklist:read": "Checklist — lecture",
  "tasks:read": "Tâches — lecture",
  "tasks:write": "Tâches — écriture",
  "response-packages:read": "Dossiers de réponse — lecture",
  "webhooks:manage": "Webhooks — gestion",
};

export type ApiKeyStatus = "ACTIVE" | "EXPIRED" | "REVOKED";

export const API_KEY_STATUS_LABELS: Record<ApiKeyStatus, string> = {
  ACTIVE: "Active",
  EXPIRED: "Expirée",
  REVOKED: "Révoquée",
};

/** Design System — ton du `<Badge>` par statut de clé API (remplace l'ancien
 *  `apiKeyStatusBadgeClass()`, classes Tailwind brutes ; mêmes couleurs sémantiques). */
export const API_KEY_STATUS_TONE: Record<ApiKeyStatus, BadgeTone> = {
  ACTIVE: "success",
  EXPIRED: "warning",
  REVOKED: "neutral",
};

export type ApiKeySummary = {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: readonly ApiKeyScope[];
  allowedClientAccountIds: readonly string[];
  createdBy: string;
  createdAt: string;
  lastUsedAt?: string;
  expiresAt?: string;
  revokedAt?: string;
  status: ApiKeyStatus;
};

export const GOVERNED_WEBHOOK_EVENT_TYPES = [
  "tender.created",
  "task.created",
  "task.completed",
  "opportunity.go_decided",
  "opportunity.no_go_decided",
  "response_package.validated",
  "response_package.generated",
] as const;
export type GovernedWebhookEventType = (typeof GOVERNED_WEBHOOK_EVENT_TYPES)[number];

export const WEBHOOK_EVENT_TYPE_LABELS: Record<GovernedWebhookEventType, string> = {
  "tender.created": "Appel d'offres créé",
  "task.created": "Tâche créée",
  "task.completed": "Tâche terminée",
  "opportunity.go_decided": "Décision GO",
  "opportunity.no_go_decided": "Décision NO-GO",
  "response_package.validated": "Dossier de réponse validé",
  "response_package.generated": "Dossier de réponse généré",
};

export type WebhookSubscriptionStatus = "ACTIVE" | "DISABLED";

export const WEBHOOK_SUBSCRIPTION_STATUS_LABELS: Record<WebhookSubscriptionStatus, string> = {
  ACTIVE: "Actif",
  DISABLED: "Désactivé",
};

/** Design System — ton du `<Badge>` par statut d'abonnement webhook (remplace l'ancien
 *  `webhookSubscriptionStatusBadgeClass()`). */
export const WEBHOOK_SUBSCRIPTION_STATUS_TONE: Record<WebhookSubscriptionStatus, BadgeTone> = {
  ACTIVE: "success",
  DISABLED: "neutral",
};

export type WebhookSubscriptionSummary = {
  id: string;
  endpointUrl: string;
  description?: string;
  events: readonly string[];
  status: WebhookSubscriptionStatus;
  allowedClientAccountIds: readonly string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type WebhookDeliveryStatus = "PENDING" | "DELIVERING" | "SUCCEEDED" | "RETRYING" | "DEAD";

export const WEBHOOK_DELIVERY_STATUS_LABELS: Record<WebhookDeliveryStatus, string> = {
  PENDING: "En attente",
  DELIVERING: "Envoi en cours",
  SUCCEEDED: "Livré",
  RETRYING: "Nouvelle tentative programmée",
  DEAD: "Échec définitif",
};

/** Design System — ton du `<Badge>` par statut de livraison webhook (remplace l'ancien
 *  `webhookDeliveryStatusBadgeClass()`). */
export const WEBHOOK_DELIVERY_STATUS_TONE: Record<WebhookDeliveryStatus, BadgeTone> = {
  SUCCEEDED: "success",
  PENDING: "neutral",
  DELIVERING: "neutral",
  RETRYING: "warning",
  DEAD: "danger",
};

export type WebhookDeliverySummary = {
  id: string;
  eventId: string;
  eventType: string;
  status: WebhookDeliveryStatus;
  attemptCount: number;
  httpStatus?: number;
  startedAt?: string;
  completedAt?: string;
  nextAvailableAt: string;
  errorSummary?: string;
  createdAt: string;
};

export type WebhookDeliveryPage = { items: WebhookDeliverySummary[]; nextCursor: string | null };

/** Vérification UI uniquement — le backend revalide toujours via `IntegrationPermission`
 *  (`ROLE_INTEGRATION_PERMISSIONS`, OWNER/ORGANIZATION_ADMIN seulement, mission §12). */
const ORG_TIER = ["OWNER", "ORGANIZATION_ADMIN"];
export function canManageIntegrations(role: string | undefined): boolean {
  return role !== undefined && ORG_TIER.includes(role);
}
