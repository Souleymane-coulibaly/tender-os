import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { resolveOnboardingResumeState } from "./onboarding-actions";
import { onboardingQueryString, parseOnboardingQuery } from "./onboarding-query";

export const metadata: Metadata = { title: "Bienvenue sur TenderOS", robots: { index: false, follow: false } };

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Point d'entrée du wizard (mission : jamais une route vide trompeuse) — résout TOUJOURS l'étape
 * de départ depuis l'état réel du backend (jamais un état de progression persisté à part, mission
 * "ne pas créer un deuxième système d'organisation"). Un utilisateur déjà onboardé (organisation +
 * offre) n'est jamais renvoyé dans le wizard : direction `/app`.
 */
export default async function OnboardingRootPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const query = parseOnboardingQuery(await searchParams);
  const qs = onboardingQueryString(query);
  const state = await resolveOnboardingResumeState();

  if (!state.hasSession) {
    redirect(`/onboarding/compte${qs}`);
  }
  if (!state.organizationId) {
    redirect(`/onboarding/entreprise${qs}`);
  }
  if (!state.hasPlan) {
    redirect(`/onboarding/offre${qs}`);
  }

  redirect("/app");
}
