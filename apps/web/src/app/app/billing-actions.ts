"use server";

import { AppApiError, appApiFetch } from "../../lib/app-api-client";
import { publicApiFetch } from "../../lib/public-api-client";
import type {
  AoCreditLedgerPage,
  BillingInterval,
  OrganizationEntitlementsDto,
  OrganizationSubscriptionDto,
  OrganizationUsageDto,
  PassPurchasePage,
  PublicPlanCatalogEntry,
  SubscriptionPlanTier,
} from "../../lib/billing-types";
import { apiErrorMessage } from "../../lib/api-error-messages";

/** Ne laisse jamais un message backend brut atteindre un composant — même motif que
 *  `describeIntegrationsActionError`. */
function describeBillingActionError(error: unknown): string {
  if (error instanceof AppApiError) {
    console.error(`[TenderOS] Billing action failed (${error.status} ${error.code}): ${error.message}`);
    const known = apiErrorMessage(error);
    if (known) return known;
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

/** Checkpoint TENDEROS-2.1-P2.3-E9 (mission §56) — historique des crédits AO self-service, distinct
 *  de `fetchOrganizationAoCreditLedger` (Platform Admin, `platform-admin/billing-actions.ts`) : cette
 *  route lit `GET /api/v1/billing/ao-credits/ledger`, bornée à l'organisation courante côté backend,
 *  jamais un `organizationId` choisi par le frontend. */
export async function fetchAoCreditLedger(cursor?: string): Promise<AoCreditLedgerPage> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return appApiFetch<AoCreditLedgerPage>(`/api/v1/billing/ao-credits/ledger${query}`);
}

/** Checkpoint TENDEROS-2.1-P2.3-E8 (mission §4/§5, root cause de "l'utilisateur ne peut choisir
 *  que Starter") — jusqu'ici `/app/subscription` n'appelait JAMAIS cet endpoint et affichait un
 *  catalogue frontend figé (`PLAN_PRICES_CENTS`, prix seulement, jamais les entitlements/quotas
 *  réels). Même route publique déjà utilisée par `/pricing` et `/onboarding/offre`
 *  (`GET /api/v1/billing/plan-catalog`, non authentifiée — `GetPublicPlanCatalogUseCase`, SEULE
 *  source de vérité commerciale) : jamais un second catalogue maintenu ici. */
export async function fetchPlanCatalog(): Promise<PublicPlanCatalogEntry[]> {
  const result = await publicApiFetch<{ items: PublicPlanCatalogEntry[] }>("/api/v1/billing/plan-catalog");
  return result.items;
}

export type CheckoutTarget = { kind: "PASS" } | { kind: "SUBSCRIPTION"; planTier: SubscriptionPlanTier; billingInterval: BillingInterval };
export type CheckoutSessionResult = { error?: string; url?: string };

/** `returnTarget: "onboarding"` (V2 Sprint 24) fait revenir Stripe sur l'étape "Paiement" du
 *  wizard onboarding plutôt que sur l'écran Abonnement classique — voir
 *  `appBillingReturnUrls` (API). Absent = comportement inchangé pour tous les appelants existants. */
export async function createCheckoutSessionAction(target: CheckoutTarget, returnTarget?: "onboarding"): Promise<CheckoutSessionResult> {
  try {
    const result = await appApiFetch<{ sessionId: string; url: string }>("/api/v1/billing/checkout-sessions", {
      method: "POST",
      body: JSON.stringify(returnTarget ? { target, returnTarget } : { target }),
    });
    return { url: result.url };
  } catch (error) {
    return { error: describeBillingActionError(error) };
  }
}

/** Organisation déjà abonnée : Stripe s'ouvre directement sur la confirmation du forfait choisi
 *  (prorata, prochaine facture), jamais sur l'accueil générique du portail ni sur une seconde
 *  Checkout Session. Seuls le palier et la périodicité partent d'ici — le prix est résolu côté API. */
export async function createPlanChangeSessionAction(planTier: SubscriptionPlanTier, billingInterval: BillingInterval): Promise<CheckoutSessionResult> {
  try {
    const result = await appApiFetch<{ url: string }>("/api/v1/billing/plan-change-sessions", {
      method: "POST",
      body: JSON.stringify({ planTier, billingInterval }),
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
