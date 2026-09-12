import type { Metadata } from "next";
import { getCurrentMembershipRole } from "../../../../lib/app-api-client";
import {
  AO_CREDIT_MOVEMENT_TYPE_LABELS,
  aoCreditMovementTypeTone,
  BILLING_INTERVAL_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
  canManageBilling,
  daysRemainingInTrial,
  formatEurosFromCents,
  formatQuotaLimit,
  formatStorageBytes,
  PASS_PURCHASE_STATUS_LABELS,
  PASS_PURCHASE_STATUS_TONE,
  PLAN_TIER_LABELS,
  subscriptionStatusTone,
  UNLIMITED,
  type AoCreditLedgerEntryDto,
  type OrganizationEntitlementsDto,
  type OrganizationSubscriptionDto,
  type OrganizationUsageDto,
  type PassPurchaseDto,
} from "../../../../lib/billing-types";
import { Badge, Card, EmptyState, PageHeader, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "../../../../components/ui";
import { fetchAoCreditBalance, fetchAoCreditLedger, fetchEntitlements, fetchPassPurchases, fetchPlanCatalog, fetchSubscription, fetchUsage } from "../../billing-actions";
import { ApiErrorState } from "../api-error-state";
import { CheckoutButton } from "./checkout-button";
import { PlanCatalogSection } from "./plan-catalog-section";

export const metadata: Metadata = { title: "Abonnement & utilisation — TenderOS" };

/** Correctif audit Codex 22D (P1-02) — GRANTED/MANUAL ne doivent JAMAIS être présentés comme un
 *  prélèvement Stripe réel : uniquement STRIPE affiche un prix/une échéance de facturation. */
function BillingSummary({ subscription, priceCents }: { subscription: OrganizationSubscriptionDto; priceCents: number | null }) {
  if (subscription.source === "GRANTED") {
    return <p className="text-sm text-tenderos-slate">Accès offert (pilote / démo) — sans facturation</p>;
  }

  const priceText = priceCents === null ? "—" : formatEurosFromCents(priceCents);

  if (subscription.source === "MANUAL") {
    return (
      <p className="text-sm text-tenderos-slate">
        {BILLING_INTERVAL_LABELS[subscription.billingInterval]} — {priceText} · facturation gérée manuellement (hors Stripe)
      </p>
    );
  }

  return (
    <>
      <p className="text-sm text-tenderos-slate">
        {BILLING_INTERVAL_LABELS[subscription.billingInterval]} — {priceText}
      </p>
      {subscription.currentPeriodEnd ? <p className="mt-1 text-sm text-tenderos-slate">Prochaine échéance : {new Date(subscription.currentPeriodEnd).toLocaleDateString("fr-FR")}</p> : null}
    </>
  );
}

/** Checkpoint TENDEROS-2.1-P2.3-E8 (mission §18 "Essai Starter — X jours restants") — jusqu'ici
 *  cette information n'existait que sur le Dashboard (`dashboard-header.tsx`), jamais sur l'écran
 *  Abonnement lui-même. Même formule que le backend (`daysRemainingInTrial`, Math.ceil, jamais
 *  négatif) — aucun second calcul. */
function TrialBadge({ subscription }: { subscription: OrganizationSubscriptionDto }) {
  if (subscription.status !== "TRIALING" || !subscription.trialEndsAt) return null;
  const days = daysRemainingInTrial(subscription.trialEndsAt);
  return (
    <p className="mt-1 text-sm font-medium text-tenderos-navy">
      Essai {PLAN_TIER_LABELS[subscription.planTier]} — {days} jour{days === 1 ? "" : "s"} restant{days === 1 ? "" : "s"}
    </p>
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
  if (!["ACTIVE", "TRIALING"].includes(subscription.status) || !quotas) return null;
  const monthlyGrant = quotas.AO_MONTHLY_GRANT;
  const rolloverCap = quotas.AO_ROLLOVER_CAP;
  if (monthlyGrant === UNLIMITED) {
    return <p className="text-sm text-tenderos-slate">Crédits AO illimités* (fair-use)</p>;
  }
  if (monthlyGrant === 0) return null;

  const nextGrantDate = subscription.billingInterval === "MONTHLY" && subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleDateString("fr-FR") : null;

  return (
    <p className="text-sm text-tenderos-slate">
      Prochain grant : +{monthlyGrant} crédit(s) AO{nextGrantDate ? ` le ${nextGrantDate}` : "/mois"} — plafond de report {formatQuotaLimit(rolloverCap)}
    </p>
  );
}

function CurrentPlanCard({ subscription, quotas, priceCents, canManage }: { subscription: OrganizationSubscriptionDto; quotas: OrganizationEntitlementsDto["quotas"]; priceCents: number | null; canManage: boolean }) {
  return (
    <Card title="Votre forfait" actions={<Badge tone={subscriptionStatusTone(subscription.status)}>{SUBSCRIPTION_STATUS_LABELS[subscription.status]}</Badge>}>
      <h3 className="font-tenderos-display text-lg font-bold text-tenderos-navy">{PLAN_TIER_LABELS[subscription.planTier]}</h3>
      <BillingSummary subscription={subscription} priceCents={priceCents} />
      <TrialBadge subscription={subscription} />
      <div className="mt-3">
        <NextAoGrant subscription={subscription} quotas={quotas} />
      </div>
      {canManage && subscription.source === "STRIPE" ? (
        <div className="mt-4">
          <CheckoutButton kind="portal" label="Gérer mon abonnement" className="rounded-lg border border-tenderos-navy/15 px-4 py-2 text-sm font-semibold text-tenderos-navy transition hover:bg-tenderos-light" />
        </div>
      ) : null}
    </Card>
  );
}

function NoPlanCard({ canManage }: { canManage: boolean }) {
  if (!canManage) {
    return (
      <Card title="Votre forfait">
        <p className="text-sm text-tenderos-slate">Aucun abonnement actif. Contactez le Propriétaire ou l&apos;Administrateur de votre organisation.</p>
      </Card>
    );
  }
  return (
    <Card title="Votre forfait">
      <p className="text-sm text-tenderos-slate">Aucun abonnement actif pour le moment — choisissez un forfait ci-dessous.</p>
    </Card>
  );
}

function PassCard({ passPurchases, priceCents, canManage }: { passPurchases: readonly PassPurchaseDto[]; priceCents: number | null; canManage: boolean }) {
  const available = passPurchases.filter((p) => p.status === "AVAILABLE");

  return (
    <Card title="Besoin ponctuel" description={`Pass AO — paiement unique${priceCents !== null ? ` de ${formatEurosFromCents(priceCents)}` : ""}, sans engagement.`}>
      {available.length > 0 ? <p className="mb-3 text-sm text-tenderos-navy">{available.length} dossier(s) disponible(s)</p> : null}
      {canManage ? (
        <CheckoutButton
          kind="checkout"
          target={{ kind: "PASS" }}
          label="Acheter un Pass AO"
          className="rounded-lg border border-tenderos-navy/15 px-4 py-2 text-sm font-semibold text-tenderos-navy transition hover:bg-tenderos-light"
        />
      ) : null}
    </Card>
  );
}

export default async function SubscriptionPage() {
  let subscription: OrganizationSubscriptionDto | null;
  let entitlements: OrganizationEntitlementsDto;
  let passPurchases: PassPurchaseDto[];
  let aoCreditBalance: number;
  let aoCreditLedger: AoCreditLedgerEntryDto[];
  let usage: OrganizationUsageDto;
  let actorRole: string | undefined;
  let catalog: Awaited<ReturnType<typeof fetchPlanCatalog>>;

  try {
    [subscription, entitlements, passPurchases, aoCreditBalance, aoCreditLedger, usage, actorRole, catalog] = await Promise.all([
      fetchSubscription(),
      fetchEntitlements(),
      fetchPassPurchases().then((page) => page.items),
      fetchAoCreditBalance(),
      fetchAoCreditLedger().then((page) => page.items),
      fetchUsage(),
      getCurrentMembershipRole(),
      fetchPlanCatalog(),
    ]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  const canManage = canManageBilling(actorRole);
  const quotas = entitlements.quotas;
  const passEntry = catalog.find((entry) => entry.tier === "PASS");
  const currentPlanEntry = subscription ? catalog.find((entry) => entry.tier === subscription!.planTier) : undefined;
  const currentPriceCents = currentPlanEntry ? (subscription!.billingInterval === "MONTHLY" ? currentPlanEntry.monthlyPriceCents : currentPlanEntry.yearlyPriceCents) : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader guideKey="subscription" title="Abonnement & utilisation" description="Consultez votre forfait, comparez les offres disponibles et gérez votre facturation." />

      <div data-tour="guide-subscription-current-plan">
        {subscription ? <CurrentPlanCard subscription={subscription} quotas={quotas} priceCents={currentPriceCents} canManage={canManage} /> : <NoPlanCard canManage={canManage} />}
      </div>

      <div data-tour="guide-subscription-plans">
        <PlanCatalogSection catalog={catalog} currentPlanTier={subscription?.planTier ?? null} hasAnySubscription={subscription !== null} canManage={canManage} />
      </div>

      <div data-tour="guide-subscription-pass">
        <PassCard passPurchases={passPurchases} priceCents={passEntry?.onePriceCents ?? null} canManage={canManage} />
      </div>

      <div data-tour="guide-subscription-usage">
        <Card title="Utilisation">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-tenderos-slate">Crédits AO disponibles</span>
              <span className="font-medium text-tenderos-navy">
                {aoCreditBalance}
                {quotas && quotas.AO_ROLLOVER_CAP !== UNLIMITED ? ` (plafond ${quotas.AO_ROLLOVER_CAP})` : ""}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-tenderos-slate">Utilisateurs</span>
              <span className="font-medium text-tenderos-navy">
                {usage.activeUsers} / {quotas ? formatQuotaLimit(quotas.USERS_MAX) : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-tenderos-slate">Chat IA (aujourd&apos;hui)</span>
              <span className="font-medium text-tenderos-navy">
                {usage.chatMessagesToday} / {quotas ? formatQuotaLimit(quotas.CHAT_AI_DAILY_MAX) : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-tenderos-slate">Stockage</span>
              <span className="font-medium text-tenderos-navy">
                {formatStorageBytes(usage.storageBytesUsed)} / {quotas && quotas.STORAGE_GB_MAX !== UNLIMITED ? `${quotas.STORAGE_GB_MAX} Go` : "Illimité*"}
              </span>
            </div>
          </div>
        </Card>
      </div>

      {passPurchases.length > 0 ? (
        <Card title="Historique Pass AO">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-tenderos-navy/10 text-left text-tenderos-slate">
                  <th className="py-2 pr-4">Achat</th>
                  <th className="py-2 pr-4">Statut</th>
                  <th className="py-2 pr-4">Dossier associé</th>
                </tr>
              </thead>
              <tbody>
                {passPurchases.map((purchase) => (
                  <tr key={purchase.id} className="border-b border-tenderos-navy/5">
                    <td className="py-2 pr-4">{new Date(purchase.purchasedAt).toLocaleDateString("fr-FR")}</td>
                    <td className="py-2 pr-4">
                      <Badge tone={PASS_PURCHASE_STATUS_TONE[purchase.status]}>{PASS_PURCHASE_STATUS_LABELS[purchase.status]}</Badge>
                    </td>
                    <td className="py-2 pr-4 text-tenderos-slate">{purchase.consumedTenderId ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <div data-tour="guide-subscription-credit-history">
        <Card title="Historique des crédits AO">
          {aoCreditLedger.length > 0 ? (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Date</TableHeaderCell>
                  <TableHeaderCell>Type</TableHeaderCell>
                  <TableHeaderCell>Variation</TableHeaderCell>
                  <TableHeaderCell>Solde après</TableHeaderCell>
                  <TableHeaderCell>AO concerné</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {aoCreditLedger.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>{new Date(entry.createdAt).toLocaleDateString("fr-FR")}</TableCell>
                    <TableCell>
                      <Badge tone={aoCreditMovementTypeTone(entry.type)}>{AO_CREDIT_MOVEMENT_TYPE_LABELS[entry.type]}</Badge>
                    </TableCell>
                    <TableCell className={entry.amount < 0 ? "text-tenderos-slate" : "font-medium text-tenderos-navy"}>
                      {entry.amount > 0 ? `+${entry.amount}` : entry.amount}
                    </TableCell>
                    <TableCell>{entry.balanceAfter}</TableCell>
                    <TableCell className="text-tenderos-slate">{entry.tenderId ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState title="Aucun mouvement de crédit AO" description="Les attributions et consommations de crédits AO apparaîtront ici." />
          )}
        </Card>
      </div>
    </div>
  );
}
