import type { Metadata } from "next";
import { getCurrentMembershipRole } from "../../../../lib/app-api-client";
import {
  BILLING_INTERVAL_LABELS,
  PLAN_PRICES_CENTS,
  PLAN_TIER_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
  canManageBilling,
  formatEurosFromCents,
  formatQuotaLimit,
  formatStorageBytes,
  passPurchaseStatusBadgeClass,
  PASS_PURCHASE_STATUS_LABELS,
  subscriptionStatusBadgeClass,
  UNLIMITED,
  type OrganizationEntitlementsDto,
  type OrganizationSubscriptionDto,
  type OrganizationUsageDto,
  type PassPurchaseDto,
} from "../../../../lib/billing-types";
import { fetchAoCreditBalance, fetchEntitlements, fetchPassPurchases, fetchSubscription, fetchUsage } from "../../billing-actions";
import { ApiErrorState } from "../api-error-state";
import { CheckoutButton } from "./checkout-button";

export const metadata: Metadata = { title: "Abonnement & utilisation — TenderOS" };

/** Correctif audit Codex 22D (P1-02) — GRANTED/MANUAL ne doivent JAMAIS être présentés comme un
 *  prélèvement Stripe réel : uniquement STRIPE affiche un prix/une échéance de facturation. */
function BillingSummary({ subscription }: { subscription: OrganizationSubscriptionDto }) {
  if (subscription.source === "GRANTED") {
    return <p className="text-sm text-neutral-500">Accès offert (pilote / démo) — sans facturation</p>;
  }

  const price = subscription.billingInterval === "MONTHLY" ? PLAN_PRICES_CENTS[subscription.planTier].monthly : PLAN_PRICES_CENTS[subscription.planTier].yearly;
  const priceText = price === null ? "—" : formatEurosFromCents(price);

  if (subscription.source === "MANUAL") {
    return (
      <p className="text-sm text-neutral-500">
        {BILLING_INTERVAL_LABELS[subscription.billingInterval]} — {priceText} · facturation gérée manuellement (hors Stripe)
      </p>
    );
  }

  return (
    <>
      <p className="text-sm text-neutral-500">
        {BILLING_INTERVAL_LABELS[subscription.billingInterval]} — {priceText}
      </p>
      {subscription.currentPeriodEnd ? (
        <p className="mt-1 text-sm text-neutral-600">Prochaine échéance : {new Date(subscription.currentPeriodEnd).toLocaleDateString("fr-FR")}</p>
      ) : null}
    </>
  );
}

/** Correctif audit Codex 22D (P1-03) — mission §50 "prochain grant" / §46 "monthly grant, rollover
 *  cap" : jamais affiché pour un abonnement non ACTIVE (mission "un abonnement expiré ne doit
 *  jamais afficher de futur grant garanti"), ni pour un palier à crédits illimités (Enterprise). Le
 *  jour exact n'est fiable QUE pour un cycle MENSUEL (aligné sur `currentPeriodEnd`, lui-même
 *  entretenu par le webhook Stripe) — un abonnement ANNUEL affiche le montant sans date inventée
 *  (le grant mensuel réel dépend d'une planification hors périmètre 22C/22D, voir le rapport).
 */
function NextAoGrant({ subscription, quotas }: { subscription: OrganizationSubscriptionDto; quotas: OrganizationEntitlementsDto["quotas"] }) {
  if (subscription.status !== "ACTIVE" || !quotas) return null;
  const monthlyGrant = quotas.AO_MONTHLY_GRANT;
  const rolloverCap = quotas.AO_ROLLOVER_CAP;
  if (monthlyGrant === UNLIMITED) {
    return <p className="text-sm text-neutral-600">Crédits AO illimités* (fair-use)</p>;
  }
  if (monthlyGrant === 0) return null;

  const nextGrantDate = subscription.billingInterval === "MONTHLY" && subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleDateString("fr-FR") : null;

  return (
    <p className="text-sm text-neutral-600">
      Prochain grant : +{monthlyGrant} crédit(s) AO{nextGrantDate ? ` le ${nextGrantDate}` : "/mois"} — plafond de report {formatQuotaLimit(rolloverCap)}
    </p>
  );
}

function SubscriptionCard({ subscription, quotas, canManage }: { subscription: OrganizationSubscriptionDto; quotas: OrganizationEntitlementsDto["quotas"]; canManage: boolean }) {
  return (
    <section className="rounded border border-neutral-200 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{PLAN_TIER_LABELS[subscription.planTier]}</h2>
          <BillingSummary subscription={subscription} />
        </div>
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${subscriptionStatusBadgeClass(subscription.status)}`}>{SUBSCRIPTION_STATUS_LABELS[subscription.status]}</span>
      </div>

      <div className="mb-3">
        <NextAoGrant subscription={subscription} quotas={quotas} />
      </div>

      {canManage && subscription.source === "STRIPE" ? (
        <CheckoutButton kind="portal" label="Gérer mon abonnement" className="rounded border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-50" />
      ) : null}
    </section>
  );
}

function PassCard({ passPurchases, canManage }: { passPurchases: readonly PassPurchaseDto[]; canManage: boolean }) {
  const available = passPurchases.filter((p) => p.status === "AVAILABLE");
  const consumed = passPurchases.filter((p) => p.status === "CONSUMED");

  return (
    <section className="rounded border border-neutral-200 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Pass AO</h2>
          <p className="text-sm text-neutral-500">Paiement unique — {formatEurosFromCents(9900)}</p>
        </div>
      </div>

      {available.length > 0 ? <p className="mb-2 text-sm">{available.length} dossier(s) disponible(s)</p> : null}
      {consumed.length > 0 ? (
        <ul className="mb-3 flex flex-col gap-1 text-sm text-neutral-600">
          {consumed.map((p) => (
            <li key={p.id}>Pass utilisé pour le dossier : {p.consumedTenderId}</li>
          ))}
        </ul>
      ) : null}

      {canManage ? (
        <div className="flex flex-wrap gap-2">
          <CheckoutButton kind="checkout" target={{ kind: "SUBSCRIPTION", planTier: "STARTER", billingInterval: "MONTHLY" }} label="Passer à Starter" />
          <CheckoutButton
            kind="checkout"
            target={{ kind: "PASS" }}
            label="Acheter un nouveau Pass"
            className="rounded border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-50"
          />
        </div>
      ) : null}
    </section>
  );
}

function NoPlanCard({ canManage }: { canManage: boolean }) {
  if (!canManage) {
    return <p className="text-sm text-neutral-600">Aucun abonnement actif. Contactez le Propriétaire ou l&apos;Administrateur de votre organisation.</p>;
  }
  return (
    <section className="rounded border border-neutral-200 p-4">
      <h2 className="mb-3 text-lg font-semibold">Choisir une offre</h2>
      <div className="flex flex-wrap gap-2">
        <CheckoutButton kind="checkout" target={{ kind: "PASS" }} label={`Pass AO — ${formatEurosFromCents(9900)}`} />
        <CheckoutButton kind="checkout" target={{ kind: "SUBSCRIPTION", planTier: "STARTER", billingInterval: "MONTHLY" }} label={`Starter — ${formatEurosFromCents(19900)}/mois`} />
        <CheckoutButton kind="checkout" target={{ kind: "SUBSCRIPTION", planTier: "BUSINESS", billingInterval: "MONTHLY" }} label={`Business — ${formatEurosFromCents(59900)}/mois`} />
        <CheckoutButton kind="checkout" target={{ kind: "SUBSCRIPTION", planTier: "ENTERPRISE", billingInterval: "MONTHLY" }} label={`Enterprise — ${formatEurosFromCents(109900)}/mois`} />
      </div>
    </section>
  );
}

export default async function SubscriptionPage() {
  let subscription: OrganizationSubscriptionDto | null;
  let entitlements: OrganizationEntitlementsDto;
  let passPurchases: PassPurchaseDto[];
  let aoCreditBalance: number;
  let usage: OrganizationUsageDto;
  let actorRole: string | undefined;

  try {
    [subscription, entitlements, passPurchases, aoCreditBalance, usage, actorRole] = await Promise.all([
      fetchSubscription(),
      fetchEntitlements(),
      fetchPassPurchases().then((page) => page.items),
      fetchAoCreditBalance(),
      fetchUsage(),
      getCurrentMembershipRole(),
    ]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  const canManage = canManageBilling(actorRole);
  const quotas = entitlements.quotas;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Abonnement &amp; utilisation</h1>

      {subscription ? (
        <SubscriptionCard subscription={subscription} quotas={quotas} canManage={canManage} />
      ) : passPurchases.length > 0 ? (
        <PassCard passPurchases={passPurchases} canManage={canManage} />
      ) : (
        <NoPlanCard canManage={canManage} />
      )}

      <section className="rounded border border-neutral-200 p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">Utilisation</h2>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-neutral-600">Crédits AO disponibles</span>
            <span className="font-medium text-neutral-900">
              {aoCreditBalance}
              {quotas && quotas.AO_ROLLOVER_CAP !== UNLIMITED ? ` (plafond ${quotas.AO_ROLLOVER_CAP})` : ""}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-neutral-600">Utilisateurs</span>
            <span className="font-medium text-neutral-900">
              {usage.activeUsers} / {quotas ? formatQuotaLimit(quotas.USERS_MAX) : "—"}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-neutral-600">Chat IA (aujourd&apos;hui)</span>
            <span className="font-medium text-neutral-900">
              {usage.chatMessagesToday} / {quotas ? formatQuotaLimit(quotas.CHAT_AI_DAILY_MAX) : "—"}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-neutral-600">Stockage</span>
            <span className="font-medium text-neutral-900">
              {formatStorageBytes(usage.storageBytesUsed)} / {quotas && quotas.STORAGE_GB_MAX !== UNLIMITED ? `${quotas.STORAGE_GB_MAX} Go` : "Illimité*"}
            </span>
          </div>
        </div>
      </section>

      {passPurchases.length > 0 ? (
        <section className="rounded border border-neutral-200 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">Historique Pass AO</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-500">
                  <th className="py-2 pr-4">Achat</th>
                  <th className="py-2 pr-4">Statut</th>
                  <th className="py-2 pr-4">Dossier associé</th>
                </tr>
              </thead>
              <tbody>
                {passPurchases.map((purchase) => (
                  <tr key={purchase.id} className="border-b border-neutral-100">
                    <td className="py-2 pr-4">{new Date(purchase.purchasedAt).toLocaleDateString("fr-FR")}</td>
                    <td className="py-2 pr-4">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${passPurchaseStatusBadgeClass(purchase.status)}`}>{PASS_PURCHASE_STATUS_LABELS[purchase.status]}</span>
                    </td>
                    <td className="py-2 pr-4 text-neutral-600">{purchase.consumedTenderId ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
