import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { appApiFetch } from "../../../lib/app-api-client";
import { PLAN_TIER_LABELS, type OrganizationSubscriptionDto } from "../../../lib/billing-types";
import { GA_EVENTS } from "../../../lib/analytics";
import { resolveOnboardingResumeState } from "../onboarding-actions";
import { OnboardingTracker } from "../onboarding-tracker";

export const metadata: Metadata = { title: "Bienvenue — TenderOS", robots: { index: false, follow: false } };

export default async function OnboardingBienvenuePage() {
  const state = await resolveOnboardingResumeState();

  if (!state.hasSession) {
    redirect("/onboarding/compte");
  }
  if (!state.organizationId) {
    redirect("/onboarding/entreprise");
  }
  if (!state.hasPlan) {
    redirect("/onboarding/offre");
  }

  const [organization, subscriptionResult] = await Promise.all([
    appApiFetch<{ name: string }>("/api/v1/organizations/me"),
    appApiFetch<{ subscription: OrganizationSubscriptionDto | null }>("/api/v1/billing/subscription").catch(() => ({ subscription: null })),
  ]);

  const planLabel = subscriptionResult.subscription ? PLAN_TIER_LABELS[subscriptionResult.subscription.planTier] : "Pass AO";

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-6 px-4 py-16 text-center sm:px-6">
      <OnboardingTracker event={GA_EVENTS.OnboardingCompleted} />
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-tenderos-gold/15 text-3xl" aria-hidden="true">
        🎉
      </div>
      <h1 className="font-tenderos-display text-3xl font-bold text-tenderos-navy">Bienvenue sur TenderOS, {organization.name} !</h1>
      <p className="text-sm text-tenderos-slate">
        Votre organisation est configurée avec l&apos;offre <strong className="text-tenderos-navy">{planLabel}</strong>. Vous êtes prêt(e) à détecter et répondre à vos premiers
        appels d&apos;offres.
      </p>
      <Link
        href="/app"
        className="rounded-lg bg-tenderos-navy px-6 py-3 text-sm font-semibold text-white transition hover:bg-tenderos-navy/90"
      >
        Accéder à TenderOS
      </Link>
    </div>
  );
}
