import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PLAN_TIER_LABELS } from "../../../lib/billing-types";
import { GA_EVENTS } from "../../../lib/analytics";
import { resolveOnboardingResumeState } from "../onboarding-actions";
import { onboardingQueryString, parseOnboardingQuery } from "../onboarding-query";
import { OnboardingTracker } from "../onboarding-tracker";
import { CheckoutLaunchButton } from "./checkout-launch-button";
import { PaymentStatusPoller } from "./payment-status-poller";

export const metadata: Metadata = { title: "Paiement — TenderOS", robots: { index: false, follow: false } };

type SearchParams = Record<string, string | string[] | undefined>;

export default async function OnboardingPaiementPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const rawParams = await searchParams;
  const query = parseOnboardingQuery(rawParams);
  const qs = onboardingQueryString(query);
  const checkoutStatus = typeof rawParams.checkout === "string" ? rawParams.checkout : undefined;
  const state = await resolveOnboardingResumeState();

  if (!state.hasSession) {
    redirect(`/onboarding/compte${qs}`);
  }
  if (!state.organizationId) {
    redirect(`/onboarding/entreprise${qs}`);
  }
  if (state.hasPlan && checkoutStatus !== "success") {
    redirect("/onboarding/equipe");
  }

  if (checkoutStatus === "success") {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-8 px-4 py-16 sm:px-6">
        <PaymentStatusPoller />
      </div>
    );
  }

  const target = query.offer === "pass" ? ({ kind: "PASS" } as const) : query.plan && query.billing ? ({ kind: "SUBSCRIPTION", planTier: query.plan, billingInterval: query.billing } as const) : undefined;

  if (!target) {
    redirect(`/onboarding/offre${qs}`);
  }

  const label = target.kind === "PASS" ? "Pass AO — paiement unique" : `${PLAN_TIER_LABELS[target.planTier]} — ${target.billingInterval === "MONTHLY" ? "mensuel" : "annuel"}`;

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-8 px-4 py-12 sm:px-6 sm:py-16">
      <OnboardingTracker event={GA_EVENTS.OnboardingPlanSelected} />
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-tenderos-slate">Étape 4 sur 6</p>
        <h1 className="font-tenderos-display text-3xl font-bold text-tenderos-navy">Paiement sécurisé</h1>
        <p className="max-w-sm text-sm text-tenderos-slate">Vous allez être redirigé(e) vers Stripe, notre prestataire de paiement, pour finaliser votre offre.</p>
      </div>

      {checkoutStatus === "canceled" ? (
        <p role="alert" className="text-sm text-amber-700">
          Le paiement a été annulé. Vous pouvez réessayer ci-dessous.
        </p>
      ) : null}

      <div className="w-full rounded-2xl border border-tenderos-navy/10 bg-white p-6 text-center shadow-sm">
        <p className="text-sm text-tenderos-slate">Offre sélectionnée</p>
        <p className="mt-1 font-tenderos-display text-xl font-bold text-tenderos-navy">{label}</p>
      </div>

      <CheckoutLaunchButton target={target} label="Procéder au paiement" />

      <Link href={`/onboarding/offre${qs}`} className="text-sm text-tenderos-slate hover:underline">
        Changer d&apos;offre
      </Link>
    </div>
  );
}
