import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { GA_EVENTS } from "../../../lib/analytics";
import { resolveOnboardingResumeState } from "../onboarding-actions";
import { onboardingQueryString, parseOnboardingQuery } from "../onboarding-query";
import { OnboardingTracker } from "../onboarding-tracker";
import { CompteForm } from "./compte-form";

export const metadata: Metadata = { title: "Créer votre compte — TenderOS", robots: { index: false, follow: false } };

type SearchParams = Record<string, string | string[] | undefined>;

export default async function OnboardingComptePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const query = parseOnboardingQuery(await searchParams);
  const qs = onboardingQueryString(query);
  const state = await resolveOnboardingResumeState();

  if (state.hasSession) {
    redirect(`/onboarding/entreprise${qs}`);
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col items-center gap-8 px-4 py-12 sm:px-6 sm:py-16">
      <OnboardingTracker event={GA_EVENTS.OnboardingStarted} />
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-tenderos-slate">Étape 1 sur 5</p>
        <h1 className="font-tenderos-display text-3xl font-bold text-tenderos-navy">Créez votre compte</h1>
        <p className="max-w-md text-sm text-tenderos-slate">Quelques informations pour démarrer — votre organisation se configure à l&apos;étape suivante.</p>
      </div>
      <CompteForm queryString={qs} />
    </div>
  );
}
