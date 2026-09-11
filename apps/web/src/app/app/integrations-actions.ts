"use server";

import { revalidatePath } from "next/cache";
import { AppApiError, appApiFetch } from "../../lib/app-api-client";
import type { ApiKeyScope, ApiKeySummary, WebhookDeliveryPage, WebhookSubscriptionSummary } from "../../lib/integrations-types";
import { apiErrorMessage } from "../../lib/api-error-messages";

/** Ne laisse jamais un message backend brut atteindre un composant — même motif que
 *  `describeWorkspaceActionError`. */
function describeIntegrationsActionError(error: unknown): string {
  if (error instanceof AppApiError) {
    console.error(`[TenderOS] Integrations action failed (${error.status} ${error.code}): ${error.message}`);
    const known = apiErrorMessage(error);
    if (known) return known;
    switch (error.status) {
      case 401:
        return "Votre session a expiré. Veuillez vous reconnecter.";
      case 403:
        return "Vous n'avez pas les droits nécessaires pour cette action (réservée Propriétaire/Administrateur).";
      case 404:
        return "Introuvable ou accès refusé.";
      case 409:
        return "Cette action entre en conflit avec l'état actuel de la ressource.";
      case 422:
        return "Certains champs sont invalides.";
      default:
        return error.status >= 500 ? "Une erreur serveur est survenue. Veuillez réessayer." : "Une erreur est survenue.";
    }
  }
  console.error("[TenderOS] Unexpected error during an integrations action:", error);
  return "Une erreur réseau est survenue. Vérifiez votre connexion et réessayez.";
}

// ---- API Keys ----

export async function fetchApiKeys(): Promise<ApiKeySummary[]> {
  return appApiFetch<ApiKeySummary[]>("/api/v1/integrations/api-keys");
}

export type CreateApiKeyInput = { name: string; scopes: ApiKeyScope[]; allowedClientAccountIds: string[]; expiresAt?: string | undefined };
export type CreateApiKeyResult = { error?: string; fullKey?: string; apiKey?: { id: string; name: string; keyPrefix: string } };

export async function createApiKeyAction(input: CreateApiKeyInput): Promise<CreateApiKeyResult> {
  try {
    const result = await appApiFetch<{ fullKey: string; apiKey: { id: string; name: string; keyPrefix: string } }>("/api/v1/integrations/api-keys", {
      method: "POST",
      body: JSON.stringify({
        name: input.name,
        scopes: input.scopes,
        ...(input.allowedClientAccountIds.length > 0 ? { allowedClientAccountIds: input.allowedClientAccountIds } : {}),
        ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
      }),
    });
    revalidatePath("/app/integrations/api-keys");
    return { fullKey: result.fullKey, apiKey: result.apiKey };
  } catch (error) {
    return { error: describeIntegrationsActionError(error) };
  }
}

export async function revokeApiKeyAction(apiKeyId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/integrations/api-keys/${apiKeyId}/revoke`, { method: "POST" });
  } catch (error) {
    return { error: describeIntegrationsActionError(error) };
  }
  revalidatePath("/app/integrations/api-keys");
  return {};
}

// ---- Webhooks ----

export async function fetchWebhooks(): Promise<WebhookSubscriptionSummary[]> {
  return appApiFetch<WebhookSubscriptionSummary[]>("/api/v1/integrations/webhooks");
}

export async function fetchWebhook(subscriptionId: string): Promise<WebhookSubscriptionSummary> {
  return appApiFetch<WebhookSubscriptionSummary>(`/api/v1/integrations/webhooks/${subscriptionId}`);
}

export async function fetchWebhookDeliveries(subscriptionId: string, cursor?: string): Promise<WebhookDeliveryPage> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return appApiFetch<WebhookDeliveryPage>(`/api/v1/integrations/webhooks/${subscriptionId}/deliveries${query}`);
}

export type CreateWebhookInput = { endpointUrl: string; description?: string | undefined; events: string[]; allowedClientAccountIds: string[] };
export type CreateWebhookResult = { error?: string; secret?: string; subscription?: { id: string; endpointUrl: string } };

export async function createWebhookAction(input: CreateWebhookInput): Promise<CreateWebhookResult> {
  try {
    const result = await appApiFetch<{ secret: string; subscription: { id: string; endpointUrl: string } }>("/api/v1/integrations/webhooks", {
      method: "POST",
      body: JSON.stringify({
        endpointUrl: input.endpointUrl,
        events: input.events,
        ...(input.description ? { description: input.description } : {}),
        ...(input.allowedClientAccountIds.length > 0 ? { allowedClientAccountIds: input.allowedClientAccountIds } : {}),
      }),
    });
    revalidatePath("/app/integrations/webhooks");
    return { secret: result.secret, subscription: result.subscription };
  } catch (error) {
    return { error: describeIntegrationsActionError(error) };
  }
}

export async function setWebhookStatusAction(subscriptionId: string, enabled: boolean): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/integrations/webhooks/${subscriptionId}/status`, { method: "POST", body: JSON.stringify({ enabled }) });
  } catch (error) {
    return { error: describeIntegrationsActionError(error) };
  }
  revalidatePath("/app/integrations/webhooks");
  revalidatePath(`/app/integrations/webhooks/${subscriptionId}`);
  return {};
}

export async function deleteWebhookAction(subscriptionId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/integrations/webhooks/${subscriptionId}/delete`, { method: "POST" });
  } catch (error) {
    return { error: describeIntegrationsActionError(error) };
  }
  revalidatePath("/app/integrations/webhooks");
  return {};
}

export async function sendTestWebhookEventAction(subscriptionId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/integrations/webhooks/${subscriptionId}/test`, { method: "POST" });
  } catch (error) {
    return { error: describeIntegrationsActionError(error) };
  }
  revalidatePath(`/app/integrations/webhooks/${subscriptionId}`);
  return {};
}

export async function retryWebhookDeliveryAction(subscriptionId: string, deliveryId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/integrations/webhooks/deliveries/${deliveryId}/retry`, { method: "POST" });
  } catch (error) {
    return { error: describeIntegrationsActionError(error) };
  }
  revalidatePath(`/app/integrations/webhooks/${subscriptionId}`);
  return {};
}
