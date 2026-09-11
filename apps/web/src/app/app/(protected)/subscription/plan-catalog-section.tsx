"use client";

import { useState } from "react";
import { Badge, Card } from "../../../../components/ui";
import {
  ENTITLEMENT_FEATURE_LABELS,
  formatEurosFromCents,
  formatQuotaLimit,
  type BillingInterval,
  type EntitlementFeature,
  type PublicPlanCatalogEntry,
  type SubscriptionPlanTier,
} from "../../../../lib/billing-types";
import { CheckoutButton } from "./checkout-button";

/**
 * Checkpoint TENDEROS-2.1-P2.3-E8 — corrige la cause racine du bug produit "l'utilisateur ne peut
 * choisir que Starter" (mission §3/§4/§30) : cette section rend le VRAI catalogue dynamique
 * (`GET /billing/plan-catalog`, SEULE source de vérité — jamais `PLAN_PRICES_CENTS` figé), pas un
 * JSX Business/Enterprise codé en dur.
 *
 * Décision d'architecture (mission §10/§32 "ne pas inventer un moteur de changement de plan, ne
 * pas casser des données") — audit E8 : `CreateCheckoutSessionUseCase` crée TOUJOURS une NOUVELLE
 * Stripe Checkout Session (`mode: "subscription"`), jamais une mise à jour de l'abonnement Stripe
 * existant (aucun `stripe.subscriptions.update`/proration trouvé dans tout le module `billing`).
 * Router un changement de palier pour une organisation DÉJÀ abonnée à travers ce mécanisme
 * créerait un second abonnement Stripe parallèle, jamais un remplacement — un vrai risque de double
 * facturation. Le Portail Client Stripe (déjà câblé, `createCustomerPortalSessionAction`) reste le
 * SEUL chemin sûr et déjà existant pour changer de palier une fois abonné — utilisé ici pour
 * upgrade ET downgrade, jamais un nouveau moteur de changement de plan construit dans ce
 * Checkpoint. Seule une organisation SANS abonnement (`hasAnySubscription=false`) reçoit un CTA de
 * checkout direct, motif déjà établi et testé par `NoPlanCard`/`PassCard`.
 */
export function PlanCatalogSection({
  catalog,
  currentPlanTier,
  hasAnySubscription,
  canManage,
}: {
  catalog: readonly PublicPlanCatalogEntry[];
  currentPlanTier: SubscriptionPlanTier | null;
  hasAnySubscription: boolean;
  canManage: boolean;
}) {
  const subscriptionTiers = catalog.filter((entry): entry is PublicPlanCatalogEntry & { tier: SubscriptionPlanTier } => entry.tier !== "PASS");
  const supportsYearly = subscriptionTiers.some((entry) => entry.billingIntervalsSupported.includes("YEARLY"));
  const [interval, setInterval] = useState<BillingInterval>("MONTHLY");

  return (
    <Card
      title="Choisissez votre forfait"
      actions={
        supportsYearly ? (
          <div className="flex items-center gap-1 rounded-lg bg-tenderos-light p-1 text-sm">
            <button
              type="button"
              onClick={() => setInterval("MONTHLY")}
              className={`rounded-md px-3 py-1 font-medium transition ${interval === "MONTHLY" ? "bg-white text-tenderos-navy shadow-sm" : "text-tenderos-slate"}`}
            >
              Mensuel
            </button>
            <button
              type="button"
              onClick={() => setInterval("YEARLY")}
              className={`rounded-md px-3 py-1 font-medium transition ${interval === "YEARLY" ? "bg-white text-tenderos-navy shadow-sm" : "text-tenderos-slate"}`}
            >
              Annuel
            </button>
          </div>
        ) : undefined
      }
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {subscriptionTiers.map((entry) => (
          <PlanCard key={entry.tier} entry={entry} interval={interval} isCurrent={entry.tier === currentPlanTier} hasAnySubscription={hasAnySubscription} canManage={canManage} />
        ))}
      </div>
    </Card>
  );
}

function PlanCard({
  entry,
  interval,
  isCurrent,
  hasAnySubscription,
  canManage,
}: {
  entry: PublicPlanCatalogEntry & { tier: SubscriptionPlanTier };
  interval: BillingInterval;
  isCurrent: boolean;
  hasAnySubscription: boolean;
  canManage: boolean;
}) {
  const priceCents = interval === "MONTHLY" ? entry.monthlyPriceCents : entry.yearlyPriceCents;
  const usersMax = formatQuotaLimit(entry.quotas.USERS_MAX);
  const aoGrant = formatQuotaLimit(entry.quotas.AO_MONTHLY_GRANT);
  const topFeatures = entry.entitlements.slice(0, 2) as EntitlementFeature[];

  return (
    <Card padding="tight" className={isCurrent ? "border-tenderos-blue ring-1 ring-tenderos-blue" : ""}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="font-tenderos-display text-base font-bold text-tenderos-navy">{entry.displayName}</h3>
          {isCurrent ? <Badge tone="info">Plan actuel</Badge> : null}
        </div>
        <p className="text-2xl font-extrabold tabular-nums text-tenderos-navy">
          {priceCents === null ? "—" : formatEurosFromCents(priceCents)}
          {priceCents !== null ? <span className="text-sm font-medium text-tenderos-slate"> /{interval === "MONTHLY" ? "mois" : "an"}</span> : null}
        </p>
        <ul className="flex flex-col gap-1 text-sm text-tenderos-slate">
          <li>{usersMax === "Illimité*" ? "Utilisateurs illimités*" : `Jusqu'à ${usersMax} utilisateurs`}</li>
          <li>{aoGrant === "Illimité*" ? "Crédits AO illimités*" : `${aoGrant} crédit(s) AO/mois`}</li>
          {topFeatures.map((feature) => (
            <li key={feature}>{ENTITLEMENT_FEATURE_LABELS[feature] ?? feature}</li>
          ))}
        </ul>
        {!canManage ? null : isCurrent ? (
          <span className="rounded-lg border border-tenderos-navy/15 px-3 py-2 text-center text-sm font-semibold text-tenderos-slate">Plan actuel</span>
        ) : hasAnySubscription ? (
          <div className="flex flex-col gap-1">
            <CheckoutButton
              kind="plan-change"
              planTier={entry.tier}
              billingInterval={interval}
              label={`Passer à ${entry.displayName}`}
              className="w-full rounded-lg bg-tenderos-navy px-4 py-2 text-center text-sm font-semibold text-white transition hover:bg-tenderos-navy/90"
            />
            <p className="text-center text-xs text-tenderos-slate">Vous confirmez le changement et le prorata sur Stripe.</p>
          </div>
        ) : (
          <CheckoutButton
            kind="checkout"
            target={{ kind: "SUBSCRIPTION", planTier: entry.tier, billingInterval: interval }}
            label={`Passer à ${entry.displayName}`}
            className="w-full rounded-lg bg-tenderos-navy px-4 py-2 text-center text-sm font-semibold text-white transition hover:bg-tenderos-navy/90"
          />
        )}
      </div>
    </Card>
  );
}
