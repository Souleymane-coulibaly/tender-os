import { Badge, Card, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "../../../../../components/ui";
import {
  BILLING_INTERVAL_LABELS,
  formatQuotaLimit,
  formatStorageBytes,
  PASS_PURCHASE_STATUS_LABELS,
  PASS_PURCHASE_STATUS_TONE,
  PLAN_SOURCE_LABELS,
  PLAN_TIER_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
  subscriptionStatusTone,
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

const DT_CLASSES = "text-xs uppercase tracking-wide text-tenderos-slate";

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
      <Card title="Abonnement & Usage">
        {subscription ? (
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-tenderos-navy">
                {PLAN_TIER_LABELS[subscription.planTier]} — {BILLING_INTERVAL_LABELS[subscription.billingInterval]}
              </p>
              <p className="text-xs text-tenderos-slate">Source : {PLAN_SOURCE_LABELS[subscription.source]}</p>
              {subscription.currentPeriodEnd ? (
                <p className="text-xs text-tenderos-slate">Prochaine échéance : {new Date(subscription.currentPeriodEnd).toLocaleDateString("fr-FR")}</p>
              ) : null}
              {subscription.stripeCustomerId ? <p className="text-xs text-tenderos-slate">Stripe Customer : {truncateStripeId(subscription.stripeCustomerId)}</p> : null}
            </div>
            <Badge tone={subscriptionStatusTone(subscription.status)}>{SUBSCRIPTION_STATUS_LABELS[subscription.status]}</Badge>
          </div>
        ) : (
          <p className="mb-3 text-sm text-tenderos-slate">Aucun abonnement (Pass AO seul, ou aucun plan).</p>
        )}

        <dl className="grid grid-cols-2 gap-3 text-sm text-tenderos-navy sm:grid-cols-4">
          <div>
            <dt className={DT_CLASSES}>Crédits AO</dt>
            <dd>{aoCreditBalance}</dd>
          </div>
          <div>
            <dt className={DT_CLASSES}>Grant mensuel</dt>
            <dd>{quotas ? formatQuotaLimit(quotas.AO_MONTHLY_GRANT) : "—"}</dd>
          </div>
          <div>
            <dt className={DT_CLASSES}>Plafond de report</dt>
            <dd>{quotas ? formatQuotaLimit(quotas.AO_ROLLOVER_CAP) : "—"}</dd>
          </div>
          <div>
            <dt className={DT_CLASSES}>Prochain grant</dt>
            <dd>
              {subscription && subscription.status === "ACTIVE" && quotas && quotas.AO_MONTHLY_GRANT !== UNLIMITED && quotas.AO_MONTHLY_GRANT > 0
                ? `+${quotas.AO_MONTHLY_GRANT}${subscription.billingInterval === "MONTHLY" && subscription.currentPeriodEnd ? ` le ${new Date(subscription.currentPeriodEnd).toLocaleDateString("fr-FR")}` : "/mois"}`
                : "—"}
            </dd>
          </div>
          <div>
            <dt className={DT_CLASSES}>Utilisateurs</dt>
            <dd>
              {usage.activeUsers} / {quotas ? formatQuotaLimit(quotas.USERS_MAX) : "—"}
            </dd>
          </div>
          <div>
            <dt className={DT_CLASSES}>Chat IA (jour)</dt>
            <dd>
              {usage.chatMessagesToday} / {quotas ? formatQuotaLimit(quotas.CHAT_AI_DAILY_MAX) : "—"}
            </dd>
          </div>
          <div>
            <dt className={DT_CLASSES}>Stockage</dt>
            <dd>
              {formatStorageBytes(usage.storageBytesUsed)} / {quotas && quotas.STORAGE_GB_MAX !== UNLIMITED ? `${quotas.STORAGE_GB_MAX} Go` : "Illimité*"}
            </dd>
          </div>
        </dl>
      </Card>

      {passPurchases.items.length > 0 ? (
        <Card title="Pass AO achetés">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Achat</TableHeaderCell>
                <TableHeaderCell>Statut</TableHeaderCell>
                <TableHeaderCell>Dossier associé</TableHeaderCell>
                <TableHeaderCell>Référence</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {passPurchases.items.map((purchase) => (
                <TableRow key={purchase.id}>
                  <TableCell>{new Date(purchase.purchasedAt).toLocaleDateString("fr-FR")}</TableCell>
                  <TableCell>
                    <Badge tone={PASS_PURCHASE_STATUS_TONE[purchase.status]}>{PASS_PURCHASE_STATUS_LABELS[purchase.status]}</Badge>
                  </TableCell>
                  <TableCell className="text-tenderos-slate">{purchase.consumedTenderId ?? "—"}</TableCell>
                  <TableCell className="text-tenderos-slate">{purchase.externalReference}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : null}

      <AssignPlanForm organizationId={organizationId} />
      <AdjustAoCreditsForm organizationId={organizationId} />
    </section>
  );
}
