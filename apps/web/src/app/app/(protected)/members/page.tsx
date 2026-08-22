import type { Metadata } from "next";
import { getCurrentMembershipRole, getCurrentUserId } from "../../../../lib/app-api-client";
import type { OrganizationMemberResponse } from "../../../../lib/membership-types";
import { computeSeatUsage, type SeatUsage } from "../../../../lib/seat-usage";
import { fetchEntitlements, fetchUsage } from "../../billing-actions";
import { fetchOrganizationMembers } from "../../membership-actions";
import { canManageMembers } from "../dashboard-permissions";
import { ApiErrorState } from "../api-error-state";
import { MembersSection } from "./members-section";

export const metadata: Metadata = { title: "Membres — TenderOS" };

/**
 * Checkpoint TENDEROS-2.1-P2.3-E1 (mission §14, problème E) — le backend
 * (`OrganizationMembershipsController`, module `memberships`) existait déjà en entier ; cette page
 * n'existait pas du tout côté frontend (audit : aucune route/lien/composant, uniquement une lecture
 * incidente dans `clients/[id]/page.tsx` pour peupler un sélecteur).
 *
 * Checkpoint TENDEROS-2.1-P2.3-E2 (Onboarding V2, mission §14/§15) — l'invitation par email est
 * désormais disponible (`invite-by-email`, réutilise `CreateMembershipUseCase`). `seatUsage` combine
 * `GET /billing/entitlements` + `GET /billing/usage` (déjà existants, mission §32 "ne créer un read
 * model que si l'architecture existante le justifie" — ici elle ne le justifie pas, deux lectures
 * suffisent) — affichage UNIQUEMENT, le backend reste seul autoritaire (mission §15).
 */
export default async function MembersPage() {
  let members: OrganizationMemberResponse[];
  let actorRole: string | undefined;
  let currentUserId: string | undefined;
  let seatUsage: SeatUsage | undefined;
  try {
    const [membersResult, actorRoleResult, currentUserIdResult, entitlements, usage] = await Promise.all([
      fetchOrganizationMembers(),
      getCurrentMembershipRole(),
      getCurrentUserId(),
      fetchEntitlements().catch(() => undefined),
      fetchUsage().catch(() => undefined),
    ]);
    members = membersResult;
    actorRole = actorRoleResult;
    currentUserId = currentUserIdResult;
    seatUsage = entitlements && usage ? computeSeatUsage(entitlements, usage) : undefined;
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  const canManage = canManageMembers(actorRole);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Membres de l&apos;organisation</h1>
      <p className="text-sm text-neutral-600">
        Gérez qui a accès à votre organisation TenderOS et avec quel rôle. Le nombre de membres actifs est limité par votre offre — consultez{" "}
        <a href="/app/subscription" className="underline hover:no-underline">
          Abonnement &amp; utilisation
        </a>{" "}
        pour votre plafond actuel.
      </p>
      <MembersSection members={members} canManage={canManage} currentUserId={currentUserId} seatUsage={seatUsage} />
    </div>
  );
}
