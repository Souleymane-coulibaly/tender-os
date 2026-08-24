import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "../../../components/ui";
import { getCurrentUserId } from "../../../lib/app-api-client";
import { GA_EVENTS } from "../../../lib/analytics";
import { computeSeatUsage } from "../../../lib/seat-usage";
import { fetchEntitlements, fetchUsage } from "../../app/billing-actions";
import { fetchOrganizationMembers } from "../../app/membership-actions";
import { InviteMemberDialog, MembersSection } from "../../app/(protected)/members/members-section";
import { resolveOnboardingResumeState } from "../onboarding-actions";
import { OnboardingTracker } from "../onboarding-tracker";

export const metadata: Metadata = { title: "Votre équipe — TenderOS", robots: { index: false, follow: false } };

/**
 * Checkpoint TENDEROS-2.1-P2.3-E2 (Onboarding V2, mission §14 "Étape 6 — Équipe", la seule étape
 * réellement manquante identifiée par l'audit — voir AUDIT_TRACE_DESIGN du rapport). Réutilise
 * TEL QUEL `MembersSection`/`fetchOrganizationMembers`/`inviteMemberByEmailAction` (mission §14
 * "réutiliser exclusivement les APIs Membership existantes", jamais un second système d'invitation) —
 * la seule organisation qui existe à ce stade appartient à l'acteur courant en tant qu'OWNER (créée
 * par `createOrganizationAction`), donc `canManage=true` sans re-résoudre le rôle.
 *
 * Mission §16 — facultative : une SEULE action "Continuer" fait avancer, qu'un membre ait été invité
 * ou non (jamais un blocage). Mission §20 — jamais un gate de reprise (`resolveOnboardingResumeState`
 * ne connaît pas cette étape) : un utilisateur qui a déjà une organisation+un plan peut toujours
 * atteindre `/app` directement sans repasser par ici, cette étape n'est qu'une PROPOSITION dans le
 * flux linéaire post-paiement, jamais une porte bloquante supplémentaire.
 */
export default async function OnboardingEquipePage() {
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

  const [members, entitlements, usage, currentUserId] = await Promise.all([
    fetchOrganizationMembers().catch(() => []),
    fetchEntitlements().catch(() => undefined),
    fetchUsage().catch(() => undefined),
    getCurrentUserId(),
  ]);
  const seatUsage = entitlements && usage ? computeSeatUsage(entitlements, usage) : undefined;

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-8 px-4 py-12 sm:px-6 sm:py-16">
      <OnboardingTracker event={GA_EVENTS.OnboardingTeamStepViewed} />
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-tenderos-slate">Étape 5 sur 6</p>
        <h1 className="font-tenderos-display text-3xl font-bold text-tenderos-navy">Votre équipe</h1>
        <p className="max-w-md text-sm text-tenderos-slate">
          Invitez les personnes qui travailleront avec vous sur vos appels d&apos;offres. Vous pourrez toujours le faire plus tard, depuis les paramètres de l&apos;organisation.
        </p>
      </div>

      <Card className="w-full" actions={<InviteMemberDialog seatUsage={seatUsage} />}>
        <MembersSection members={members} canManage currentUserId={currentUserId} />
      </Card>

      <Link href="/onboarding/configuration" className="w-full max-w-md rounded-lg bg-tenderos-navy px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-tenderos-navy/90">
        Continuer
      </Link>
    </div>
  );
}
