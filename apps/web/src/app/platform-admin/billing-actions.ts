"use server";

import { revalidatePath } from "next/cache";
import { platformApiFetch, PlatformApiError } from "../../lib/platform-api-client";
import type {
  AoCreditLedgerPage,
  BillingInterval,
  OrganizationEntitlementsDto,
  OrganizationSubscriptionDto,
  OrganizationUsageDto,
  PassPurchasePage,
  SubscriptionPlanTier,
} from "../../lib/billing-types";

/** Ne laisse jamais un message backend brut atteindre un composant — même motif que
 *  `describeIntegrationsActionError`. */
function describeBillingAdminActionError(error: unknown): string {
  if (error instanceof PlatformApiError) {
    console.error(`[TenderOS] Platform Admin billing action failed (${error.status} ${error.code}): ${error.message}`);
    if (error.status === 403) return "Cette action nécessite une capacité SubscriptionsManage (ADMIN/OWNER).";
    if (error.status === 422) return error.message;
    return "Une erreur est survenue.";
  }
  console.error("[TenderOS] Unexpected error during a Platform Admin billing action:", error);
  return "Une erreur réseau est survenue.";
}

export async function fetchOrganizationSubscription(organizationId: string): Promise<OrganizationSubscriptionDto | null> {
  const result = await platformApiFetch<{ subscription: OrganizationSubscriptionDto | null }>(`/api/v1/admin/organizations/${organizationId}/billing/subscription`);
  return result.subscription;
}

export async function fetchOrganizationEntitlements(organizationId: string): Promise<OrganizationEntitlementsDto> {
  return platformApiFetch<OrganizationEntitlementsDto>(`/api/v1/admin/organizations/${organizationId}/billing/entitlements`);
}

export async function fetchOrganizationPassPurchases(organizationId: string): Promise<PassPurchasePage> {
  return platformApiFetch<PassPurchasePage>(`/api/v1/admin/organizations/${organizationId}/billing/pass-purchases`);
}

export async function fetchOrganizationUsage(organizationId: string): Promise<OrganizationUsageDto> {
  return platformApiFetch<OrganizationUsageDto>(`/api/v1/admin/organizations/${organizationId}/billing/usage`);
}

export async function fetchOrganizationAoCreditBalance(organizationId: string): Promise<number> {
  const result = await platformApiFetch<{ balance: number }>(`/api/v1/admin/organizations/${organizationId}/ao-credits`);
  return result.balance;
}

export async function fetchOrganizationAoCreditLedger(organizationId: string, cursor?: string): Promise<AoCreditLedgerPage> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return platformApiFetch<AoCreditLedgerPage>(`/api/v1/admin/organizations/${organizationId}/ao-credits/ledger${query}`);
}

export type AssignPlanActionState = { error?: string; success?: boolean };

export async function assignPlanAction(
  organizationId: string,
  _prevState: AssignPlanActionState,
  formData: FormData,
): Promise<AssignPlanActionState> {
  const planTier = formData.get("planTier") as SubscriptionPlanTier | null;
  const billingInterval = formData.get("billingInterval") as BillingInterval | null;
  const source = formData.get("source") as "MANUAL" | "GRANTED" | null;

  if (!planTier || !billingInterval || !source) {
    return { error: "Tous les champs sont requis." };
  }

  try {
    await platformApiFetch(`/api/v1/admin/organizations/${organizationId}/billing/assign-plan`, {
      method: "POST",
      body: JSON.stringify({ planTier, billingInterval, source }),
    });
  } catch (error) {
    return { error: describeBillingAdminActionError(error) };
  }

  revalidatePath(`/platform-admin/organizations/${organizationId}`);
  return { success: true };
}

export type AdjustAoCreditsActionState = { error?: string; success?: boolean };

export async function adjustAoCreditsAction(
  organizationId: string,
  _prevState: AdjustAoCreditsActionState,
  formData: FormData,
): Promise<AdjustAoCreditsActionState> {
  const amountRaw = formData.get("amount");
  const reason = formData.get("reason");
  const amount = typeof amountRaw === "string" ? Number.parseInt(amountRaw, 10) : NaN;

  if (!Number.isFinite(amount) || amount === 0) {
    return { error: "Le montant doit être un entier non nul (ex. +1 ou -1)." };
  }
  if (typeof reason !== "string" || reason.trim().length === 0) {
    return { error: "Un motif est obligatoire." };
  }

  try {
    await platformApiFetch(`/api/v1/admin/organizations/${organizationId}/ao-credits/adjust`, {
      method: "POST",
      body: JSON.stringify({ amount, reason: reason.trim() }),
    });
  } catch (error) {
    return { error: describeBillingAdminActionError(error) };
  }

  revalidatePath(`/platform-admin/organizations/${organizationId}`);
  return { success: true };
}
