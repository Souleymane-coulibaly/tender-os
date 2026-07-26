import { LastOrganizationAdminError } from "../../domain/errors";
import type { OrganizationMembership } from "../../domain/organization-membership.aggregate";
import { OrganizationRole } from "../../domain/organization-role";
import type { MembershipRepository } from "../ports/membership.repository";

/**
 * BR-ORG-002 — le dernier Organization Admin actif ne peut pas être rétrogradé, suspendu
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
