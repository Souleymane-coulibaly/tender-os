"use server";

import { AppApiError, appApiFetch } from "../../lib/app-api-client";
import type {
  BillingInterval,
  OrganizationEntitlementsDto,
  OrganizationSubscriptionDto,
  OrganizationUsageDto,
  PassPurchasePage,
  SubscriptionPlanTier,
} from "../../lib/billing-types";

/** Ne laisse jamais un message backend brut atteindre un composant — même motif que
 *  `describeIntegrationsActionError`. */
function describeBillingActionError(error: unknown): string {
  if (error instanceof AppApiError) {
    console.error(`[TenderOS] Billing action failed (${error.status} ${error.code}): ${error.message}`);
    switch (error.status) {
      case 401:
        return "Votre session a expiré. Veuillez vous reconnecter.";
      case 402:
        return "Aucun crédit AO disponible.";
      case 403:
        return "Cette action est réservée au Propriétaire ou à l'Administrateur de l'organisation.";
      case 404:
        return "Introuvable ou accès refusé.";
      case 422:
        if (error.code === "NO_STRIPE_CUSTOMER_FOR_ORGANIZATION") return "Aucun abonnement actif à gérer — le Pass AO ne dispose pas de Portail Client.";
        if (error.code === "STRIPE_PRICE_NOT_CONFIGURED") return "Ce plan n'est pas encore disponible à l'achat. Contactez le support.";
        return "Certains champs sont invalides.";
      default:
        return error.status >= 500 ? "Une erreur serveur est survenue. Veuillez réessayer." : "Une erreur est survenue.";
    }
  }
  console.error("[TenderOS] Unexpected error during a billing action:", error);
  return "Une erreur réseau est survenue. Vérifiez votre connexion et réessayez.";
}

export async function fetchSubscription(): Promise<OrganizationSubscriptionDto | null> {
  const result = await appApiFetch<{ subscription: OrganizationSubscriptionDto | null }>("/api/v1/billing/subscription");
  return result.subscription;
}

export async function fetchEntitlements(): Promise<OrganizationEntitlementsDto> {
  return appApiFetch<OrganizationEntitlementsDto>("/api/v1/billing/entitlements");
}

export async function fetchPassPurchases(cursor?: string): Promise<PassPurchasePage> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return appApiFetch<PassPurchasePage>(`/api/v1/billing/pass-purchases${query}`);
}

export async function fetchAoCreditBalance(): Promise<number> {
  const result = await appApiFetch<{ balance: number }>("/api/v1/billing/ao-credits");
  return result.balance;
}

export async function fetchUsage(): Promise<OrganizationUsageDto> {
  return appApiFetch<OrganizationUsageDto>("/api/v1/billing/usage");
}

export type CheckoutTarget = { kind: "PASS" } | { kind: "SUBSCRIPTION"; planTier: SubscriptionPlanTier; billingInterval: BillingInterval };
export type CheckoutSessionResult = { error?: string; url?: string };

export async function createCheckoutSessionAction(target: CheckoutTarget): Promise<CheckoutSessionResult> {
  try {
    const result = await appApiFetch<{ sessionId: string; url: string }>("/api/v1/billing/checkout-sessions", {
      method: "POST",
      body: JSON.stringify({ target }),
    });
    return { url: result.url };
  } catch (error) {
    return { error: describeBillingActionError(error) };
  }
}

export async function createCustomerPortalSessionAction(): Promise<CheckoutSessionResult> {
  try {
    const result = await appApiFetch<{ url: string }>("/api/v1/billing/customer-portal-sessions", { method: "POST" });
    return { url: result.url };
  } catch (error) {
    return { error: describeBillingActionError(error) };
  }
}
