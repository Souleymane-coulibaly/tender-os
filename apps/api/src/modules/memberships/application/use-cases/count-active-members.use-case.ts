import { Inject, Injectable } from "@nestjs/common";
import { MEMBERSHIP_REPOSITORY, type MembershipRepository } from "../ports/membership.repository";

export type CountActiveMembersQuery = Readonly<{ organizationId: string }>;

/**
 * Indicateur simple ("nombre de membres si disponible") — exposé aux consommateurs
 * publics habilités (ex. Platform Administration), sans exposer la liste elle-même.
 */
@Injectable()
export class CountActiveMembersUseCase {
  constructor(
    @Inject(MEMBERSHIP_REPOSITORY) private readonly membershipRepository: MembershipRepository,
  ) {}

  async execute(query: CountActiveMembersQuery): Promise<number> {
    return this.membershipRepository.countActiveByOrganization(query.organizationId);
  }
}
