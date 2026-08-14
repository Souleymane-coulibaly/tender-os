import {
  BILLING_INTERVAL_LABELS,
  formatQuotaLimit,
  formatStorageBytes,
  PASS_PURCHASE_STATUS_LABELS,
  passPurchaseStatusBadgeClass,
  PLAN_SOURCE_LABELS,
  PLAN_TIER_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
  subscriptionStatusBadgeClass,
  truncateStripeId,
  UNLIMITED,
} from "../../../../../lib/billing-types";
import {
  fetchOrganizationAoCreditBalance,
  fetchOrganizationEntitlements,
  fetchOrganizationPassPurchases,
  fetchOrganizationSubscription,
  fetchOrganizationUsage,
} from "../../../billing-actions";
import { ApiErrorState } from "../../api-error-state";
import { AdjustAoCreditsForm } from "./adjust-ao-credits-form";
import { AssignPlanForm } from "./assign-plan-form";

/** Mission §46/§47/§48/§49 — "Platform Admin → Organisations → Abonnement & Usage". */
export async function OrganizationBillingSection({ organizationId }: { organizationId: string }) {
  let subscription: Awaited<ReturnType<typeof fetchOrganizationSubscription>>;
  let entitlements: Awaited<ReturnType<typeof fetchOrganizationEntitlements>>;
  let passPurchases: Awaited<ReturnType<typeof fetchOrganizationPassPurchases>>;
  let usage: Awaited<ReturnType<typeof fetchOrganizationUsage>>;
  let aoCreditBalance: number;

  try {
    [subscription, entitlements, passPurchases, usage, aoCreditBalance] = await Promise.all([
      fetchOrganizationSubscription(organizationId),
      fetchOrganizationEntitlements(organizationId),
      fetchOrganizationPassPurchases(organizationId),
      fetchOrganizationUsage(organizationId),
      fetchOrganizationAoCreditBalance(organizationId),
    ]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  const quotas = entitlements.quotas;

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Abonnement &amp; Usage</h2>

      <div className="rounded border border-neutral-200 p-4">
        {subscription ? (
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">
                {PLAN_TIER_LABELS[subscription.planTier]} — {BILLING_INTERVAL_LABELS[subscription.billingInterval]}
              </p>
              <p className="text-xs text-neutral-500">Source : {PLAN_SOURCE_LABELS[subscription.source]}</p>
              {subscription.currentPeriodEnd ? (
                <p className="text-xs text-neutral-500">Prochaine échéance : {new Date(subscription.currentPeriodEnd).toLocaleDateString("fr-FR")}</p>
              ) : null}
              {subscription.stripeCustomerId ? <p className="text-xs text-neutral-500">Stripe Customer : {truncateStripeId(subscription.stripeCustomerId)}</p> : null}
            </div>
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${subscriptionStatusBadgeClass(subscription.status)}`}>{SUBSCRIPTION_STATUS_LABELS[subscription.status]}</span>
          </div>
        ) : (
          <p className="mb-3 text-sm text-neutral-600">Aucun abonnement (Pass AO seul, ou aucun plan).</p>
        )}

        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs uppercase tracking-wide text-neutral-500">Crédits AO</dt>
            <dd>{aoCreditBalance}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-neutral-500">Grant mensuel</dt>
            <dd>{quotas ? formatQuotaLimit(quotas.AO_MONTHLY_GRANT) : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-neutral-500">Plafond de report</dt>
            <dd>{quotas ? formatQuotaLimit(quotas.AO_ROLLOVER_CAP) : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-neutral-500">Prochain grant</dt>
            <dd>
              {subscription && subscription.status === "ACTIVE" && quotas && quotas.AO_MONTHLY_GRANT !== UNLIMITED && quotas.AO_MONTHLY_GRANT > 0
                ? `+${quotas.AO_MONTHLY_GRANT}${subscription.billingInterval === "MONTHLY" && subscription.currentPeriodEnd ? ` le ${new Date(subscription.currentPeriodEnd).toLocaleDateString("fr-FR")}` : "/mois"}`
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-neutral-500">Utilisateurs</dt>
            <dd>
              {usage.activeUsers} / {quotas ? formatQuotaLimit(quotas.USERS_MAX) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-neutral-500">Chat IA (jour)</dt>
            <dd>
              {usage.chatMessagesToday} / {quotas ? formatQuotaLimit(quotas.CHAT_AI_DAILY_MAX) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-neutral-500">Stockage</dt>
            <dd>
              {formatStorageBytes(usage.storageBytesUsed)} / {quotas && quotas.STORAGE_GB_MAX !== UNLIMITED ? `${quotas.STORAGE_GB_MAX} Go` : "Illimité*"}
            </dd>
          </div>
        </dl>
      </div>

      {passPurchases.items.length > 0 ? (
        <div className="rounded border border-neutral-200 p-4">
          <h3 className="mb-2 text-sm font-semibold">Pass AO achetés</h3>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-500">
                  <th className="py-2 pr-4">Achat</th>
                  <th className="py-2 pr-4">Statut</th>
                  <th className="py-2 pr-4">Dossier associé</th>
                  <th className="py-2 pr-4">Référence</th>
                </tr>
              </thead>
              <tbody>
                {passPurchases.items.map((purchase) => (
                  <tr key={purchase.id} className="border-b border-neutral-100">
                    <td className="py-2 pr-4">{new Date(purchase.purchasedAt).toLocaleDateString("fr-FR")}</td>
                    <td className="py-2 pr-4">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${passPurchaseStatusBadgeClass(purchase.status)}`}>{PASS_PURCHASE_STATUS_LABELS[purchase.status]}</span>
                    </td>
                    <td className="py-2 pr-4 text-neutral-600">{purchase.consumedTenderId ?? "—"}</td>
                    <td className="py-2 pr-4 text-neutral-600">{purchase.externalReference}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <AssignPlanForm organizationId={organizationId} />
      <AdjustAoCreditsForm organizationId={organizationId} />
    </section>
  );
}
