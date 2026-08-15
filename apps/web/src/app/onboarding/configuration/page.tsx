import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { resolveOnboardingResumeState } from "../onboarding-actions";
import { ConfigurationForm } from "./configuration-form";

export const metadata: Metadata = { title: "Configuration initiale — TenderOS", robots: { index: false, follow: false } };

export default async function OnboardingConfigurationPage() {
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

  return (
    <div className="mx-auto flex max-w-6xl flex-col items-center gap-8 px-4 py-12 sm:px-6 sm:py-16">
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-tenderos-slate">Étape 5 sur 5</p>
        <h1 className="font-tenderos-display text-3xl font-bold text-tenderos-navy">Configuration initiale</h1>
        <p className="max-w-md text-sm text-tenderos-slate">Facultatif — ces préférences nous aident à personnaliser votre expérience. Modifiable à tout moment.</p>
      </div>
      <ConfigurationForm />
    </div>
  );
}
