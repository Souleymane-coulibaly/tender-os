import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { GA_EVENTS } from "../../../lib/analytics";
import { resolveOnboardingResumeState } from "../onboarding-actions";
import { onboardingQueryString, parseOnboardingQuery } from "../onboarding-query";
import { OnboardingTracker } from "../onboarding-tracker";
import { EntrepriseForm } from "./entreprise-form";

export const metadata: Metadata = { title: "Votre entreprise — TenderOS", robots: { index: false, follow: false } };

type SearchParams = Record<string, string | string[] | undefined>;

export default async function OnboardingEntreprisePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const query = parseOnboardingQuery(await searchParams);
  const qs = onboardingQueryString(query);
  const state = await resolveOnboardingResumeState();

  if (!state.hasSession) {
    redirect(`/onboarding/compte${qs}`);
  }
  if (state.organizationId) {
    redirect(`/onboarding/offre${qs}`);
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col items-center gap-8 px-4 py-12 sm:px-6 sm:py-16">
      <OnboardingTracker event={GA_EVENTS.OnboardingAccountCompleted} />
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-tenderos-slate">Étape 2 sur 6</p>
        <h1 className="font-tenderos-display text-3xl font-bold text-tenderos-navy">Votre entreprise</h1>
        <p className="max-w-md text-sm text-tenderos-slate">Ces informations restent modifiables à tout moment depuis les paramètres de l&apos;organisation.</p>
      </div>
      <EntrepriseForm queryString={qs} />
    </div>
  );
}
