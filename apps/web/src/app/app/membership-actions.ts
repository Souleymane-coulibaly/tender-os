"use server";

import { revalidatePath } from "next/cache";
import { AppApiError, appApiFetch } from "../../lib/app-api-client";
import type { OrganizationMemberResponse, PageResponse } from "../../lib/membership-types";

/**
 * Checkpoint TENDEROS-2.1-P2.3-E1 (mission §14, problème E) — le backend (`memberships` module,
 * `OrganizationMembershipsController`) existait déjà en entier (list/create/role-change/suspend/
 * remove) ; seul le frontend manquait totalement.
 *
 * Checkpoint TENDEROS-2.1-P2.3-E2 (Onboarding V2, mission §14) — `inviteMemberByEmailAction` ajouté
 * (route backend `POST /organization-memberships/invite-by-email`, résout l'email vers un compte
 * TenderOS existant puis délègue à `CreateMembershipUseCase` tel quel, jamais un second moteur
 * d'invitation). Le cas honnête "personne n'a encore de compte avec cet email" (404 USER_NOT_FOUND)
 * est traduit ci-dessous en message clair, jamais un envoi d'email/pré-inscription inventés.
 */
function describeMembershipActionError(error: unknown): string {
  if (error instanceof AppApiError) {
    console.error(`[TenderOS] Membership action failed (${error.status} ${error.code}): ${error.message}`);
    switch (error.status) {
      case 401:
        return "Votre session a expiré. Veuillez vous reconnecter.";
      case 402:
        if (error.code === "SEAT_LIMIT_EXCEEDED") return "Votre organisation a atteint le nombre maximum d'utilisateurs prévu par son offre. Passez à une offre supérieure pour inviter davantage de membres.";
        return "Cette action nécessite une offre supérieure.";
      case 403:
        return "Cette action est réservée au Propriétaire ou à l'Administrateur de l'organisation.";
      case 404:
        if (error.code === "USER_NOT_FOUND") return "Aucun compte TenderOS n'existe avec cette adresse email. Cette personne doit d'abord créer un compte, puis vous pourrez l'inviter.";
        return "Introuvable ou accès refusé.";
      case 409:
        if (error.code === "MEMBERSHIP_ALREADY_EXISTS") return "Cette personne est déjà membre de l'organisation.";
        if (error.code === "LAST_ORGANIZATION_ADMIN_REQUIRED") return "Impossible : l'organisation doit toujours conserver au moins un Administrateur actif.";
        if (error.code === "LAST_ORGANIZATION_OWNER_REQUIRED") return "Impossible : l'organisation doit toujours conserver exactement un Propriétaire actif.";
        return "Cette action entre en conflit avec l'état actuel du membre.";
      case 422:
        if (error.code === "OWNERSHIP_REQUIRES_TRANSFER") return "Le rôle Propriétaire ne peut être attribué que via un transfert de propriété dédié.";
        return "Certains champs sont invalides.";
      default:
        return error.status >= 500 ? "Une erreur serveur est survenue. Veuillez réessayer." : "Une erreur est survenue.";
    }
  }
  console.error("[TenderOS] Unexpected error during a membership action:", error);
  return "Une erreur réseau est survenue. Vérifiez votre connexion et réessayez.";
}

export async function fetchOrganizationMembers(): Promise<OrganizationMemberResponse[]> {
  const page = await appApiFetch<PageResponse<OrganizationMemberResponse>>("/api/v1/organization-memberships?limit=100");
  return [...page.items];
}

export async function addMemberAction(input: { userId: string; role: string }): Promise<{ error?: string }> {
  try {
    await appApiFetch("/api/v1/organization-memberships", { method: "POST", body: JSON.stringify({ userId: input.userId, role: input.role }) });
  } catch (error) {
    return { error: describeMembershipActionError(error) };
  }
  revalidatePath("/app/members");
  return {};
}

/** Checkpoint TENDEROS-2.1-P2.3-E2 (Onboarding V2, mission §14) — invitation par email, réutilisée
 *  identiquement par `/app/members` et l'étape onboarding `/onboarding/equipe`. `revalidatePath` sur
 *  les deux surfaces : un appel depuis l'une doit rafraîchir l'autre si l'utilisateur navigue entre
 *  les deux dans la même session. */
export async function inviteMemberByEmailAction(input: { email: string; role: string }): Promise<{ error?: string }> {
  try {
    await appApiFetch("/api/v1/organization-memberships/invite-by-email", { method: "POST", body: JSON.stringify({ email: input.email, role: input.role }) });
  } catch (error) {
    return { error: describeMembershipActionError(error) };
  }
  revalidatePath("/app/members");
  revalidatePath("/onboarding/equipe");
  return {};
}

export async function changeMemberRoleAction(membershipId: string, role: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/organization-memberships/${membershipId}/role`, { method: "PATCH", body: JSON.stringify({ role }) });
  } catch (error) {
    return { error: describeMembershipActionError(error) };
  }
  revalidatePath("/app/members");
  return {};
}

export async function suspendMemberAction(membershipId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/organization-memberships/${membershipId}/suspend`, { method: "POST" });
  } catch (error) {
    return { error: describeMembershipActionError(error) };
  }
  revalidatePath("/app/members");
  return {};
}

export async function removeMemberAction(membershipId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/organization-memberships/${membershipId}`, { method: "DELETE" });
  } catch (error) {
    return { error: describeMembershipActionError(error) };
  }
  revalidatePath("/app/members");
  return {};
}
