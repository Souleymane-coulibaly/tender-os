import { LastOrganizationAdminError, LastOrganizationOwnerError } from "../../domain/errors";
import type { OrganizationMembership } from "../../domain/organization-membership.aggregate";
import { OrganizationRole } from "../../domain/organization-role";
import type { MembershipRepository } from "../ports/membership.repository";

/**
 * BR-ORG-002bis — le dernier Organization Admin actif ne peut pas être rétrogradé, suspendu
 * ni retiré sans transfert préalable. Ne s'applique qu'aux Memberships actuellement admin ;
 * no-op pour tout autre rôle.
 */
export async function assertNotLastActiveOrganizationAdmin(input: {
  membershipRepository: MembershipRepository;
  organizationId: string;
  membership: OrganizationMembership;
}): Promise<void> {
  if (input.membership.role !== OrganizationRole.OrganizationAdmin) {
    return;
  }

  const activeAdminCount = await input.membershipRepository.countActiveByOrganizationAndRole({
    organizationId: input.organizationId,
    role: OrganizationRole.OrganizationAdmin,
  });

  if (activeAdminCount <= 1) {
    throw new LastOrganizationAdminError();
  }
}

/**
 * BR-ORG-002 — une organisation a toujours exactement un OWNER actif. Sous le modèle
 * "propriétaire unique" retenu pour cette tranche, le nombre d'OWNER actifs vaut toujours 0
 * ou 1 : cette fonction rejette donc systématiquement toute tentative de retirer, suspendre
 * ou rétrograder l'OWNER courant par un chemin autre que TransferOrganizationOwnershipUseCase
 * (qui, lui, ne passe jamais par cette policy). No-op pour tout autre rôle. Écrite en comptage
 * (plutôt qu'un simple `role === Owner`) pour rester correcte si plusieurs OWNER simultanés
 * sont un jour autorisés (bible/04-architecture/system-architecture.md §48).
 */
export async function assertNotLastActiveOwner(input: {
  membershipRepository: MembershipRepository;
  organizationId: string;
  membership: OrganizationMembership;
}): Promise<void> {
  if (input.membership.role !== OrganizationRole.Owner) {
    return;
  }

  const activeOwnerCount = await input.membershipRepository.countActiveByOrganizationAndRole({
    organizationId: input.organizationId,
    role: OrganizationRole.Owner,
  });

  if (activeOwnerCount <= 1) {
    throw new LastOrganizationOwnerError();
  }
}
