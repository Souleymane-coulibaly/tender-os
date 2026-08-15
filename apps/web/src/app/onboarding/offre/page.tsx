import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { formatEurosFromCents, PLAN_TIER_LABELS, type SubscriptionPlanTier } from "../../../lib/billing-types";
import { GA_EVENTS } from "../../../lib/analytics";
import { resolveOnboardingResumeState } from "../onboarding-actions";
import { onboardingQueryString, parseOnboardingQuery } from "../onboarding-query";
import { OnboardingTracker } from "../onboarding-tracker";
import { fetchOnboardingPlanCatalog } from "./offre-catalog";

export const metadata: Metadata = { title: "Choisissez votre offre — TenderOS", robots: { index: false, follow: false } };

type SearchParams = Record<string, string | string[] | undefined>;

const SUBSCRIPTION_TIERS: readonly SubscriptionPlanTier[] = ["STARTER", "BUSINESS", "ENTERPRISE"];

export default async function OnboardingOffrePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const rawParams = await searchParams;
  const query = parseOnboardingQuery(rawParams);
  const qs = onboardingQueryString(query);
  const state = await resolveOnboardingResumeState();

  if (!state.hasSession) {
    redirect(`/onboarding/compte${qs}`);
  }
  if (!state.organizationId) {
    redirect(`/onboarding/entreprise${qs}`);
  }
  if (state.hasPlan) {
    redirect("/onboarding/configuration");
  }

  const billingInterval = query.billing ?? "MONTHLY";
  const catalog = await fetchOnboardingPlanCatalog();
  const passEntry = catalog.find((entry) => entry.tier === "PASS");
  const subscriptionEntries = catalog.filter((entry): entry is typeof catalog[number] & { tier: SubscriptionPlanTier } =>
    SUBSCRIPTION_TIERS.includes(entry.tier as SubscriptionPlanTier),
  );

  function subscriptionHref(tier: SubscriptionPlanTier): string {
    return `/onboarding/paiement?plan=${tier}&billing=${billingInterval}`;
  }

  function billingToggleHref(interval: "MONTHLY" | "YEARLY"): string {
    const params = new URLSearchParams(onboardingQueryString(query).replace(/^\?/, ""));
    params.set("billing", interval);
    return `/onboarding/offre?${params.toString()}`;
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col items-center gap-8 px-4 py-12 sm:px-6 sm:py-16">
      <OnboardingTracker event={GA_EVENTS.OnboardingOrganizationCompleted} />
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-tenderos-slate">Étape 3 sur 5</p>
        <h1 className="font-tenderos-display text-3xl font-bold text-tenderos-navy">Choisissez votre offre</h1>
        <p className="max-w-md text-sm text-tenderos-slate">Tarifs réels, identiques à ceux affichés sur notre page Tarifs.</p>
      </div>

      <div className="flex items-center gap-1 rounded-full border border-tenderos-navy/10 bg-white p-1">
        <Link
          href={billingToggleHref("MONTHLY")}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${billingInterval === "MONTHLY" ? "bg-tenderos-navy text-white" : "text-tenderos-slate hover:text-tenderos-navy"}`}
        >
          Mensuel
        </Link>
        <Link
          href={billingToggleHref("YEARLY")}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${billingInterval === "YEARLY" ? "bg-tenderos-navy text-white" : "text-tenderos-slate hover:text-tenderos-navy"}`}
        >
          Annuel <span className="text-xs font-normal opacity-80">(2 mois offerts)</span>
        </Link>
      </div>

      <div className="grid w-full gap-4 sm:grid-cols-3">
        {subscriptionEntries.map((entry) => {
          const priceCents = billingInterval === "MONTHLY" ? entry.monthlyPriceCents : entry.yearlyPriceCents;
          const isPreselected = query.plan === entry.tier;
          return (
            <Link
              key={entry.tier}
              href={subscriptionHref(entry.tier)}
              className={`flex flex-col gap-3 rounded-2xl border bg-white p-6 text-left shadow-sm transition hover:border-tenderos-blue hover:shadow-md ${
                isPreselected ? "border-tenderos-blue ring-2 ring-tenderos-blue/30" : "border-tenderos-navy/10"
              }`}
            >
              <p className="font-tenderos-display text-lg font-bold text-tenderos-navy">{entry.displayName}</p>
              <p className="text-2xl font-extrabold text-tenderos-navy">
                {priceCents !== null ? formatEurosFromCents(priceCents) : "—"}
                <span className="text-sm font-normal text-tenderos-slate">{billingInterval === "MONTHLY" ? "/mois" : "/an"}</span>
              </p>
              <span className="mt-auto rounded-lg bg-tenderos-navy px-4 py-2 text-center text-sm font-semibold text-white">Choisir {PLAN_TIER_LABELS[entry.tier]}</span>
            </Link>
          );
        })}
      </div>

      {passEntry && passEntry.onePriceCents !== null ? (
        <Link
          href="/onboarding/paiement?offer=pass"
          className={`flex w-full max-w-md items-center justify-between rounded-2xl border bg-white p-4 shadow-sm transition hover:border-tenderos-blue hover:shadow-md ${
            query.offer === "pass" ? "border-tenderos-blue ring-2 ring-tenderos-blue/30" : "border-tenderos-navy/10"
          }`}
        >
          <span>
            <span className="block font-tenderos-display font-bold text-tenderos-navy">Pass AO</span>
            <span className="text-sm text-tenderos-slate">Paiement unique, un seul dossier</span>
          </span>
          <span className="text-lg font-extrabold text-tenderos-navy">{formatEurosFromCents(passEntry.onePriceCents)}</span>
        </Link>
      ) : null}
    </div>
  );
}
