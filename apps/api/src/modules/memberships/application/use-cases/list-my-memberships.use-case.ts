import { Inject, Injectable } from "@nestjs/common";
import { GetOrganizationUseCase } from "../../../organizations";
import { toMembershipSummary, type MembershipSummary } from "../dtos";
import { MEMBERSHIP_REPOSITORY, type MembershipRepository } from "../ports/membership.repository";

export type ListMyMembershipsQuery = Readonly<{
  userId: string;
  cursor?: string | undefined;
  limit: number;
}>;

export type MyMembershipView = MembershipSummary & {
  organization: { id: string; name: string; slug: string };
};

export type ListMyMembershipsResult = Readonly<{
  items: MyMembershipView[];
  nextCursor: string | null;
}>;

/**
 * Auto-scopé à l'acteur courant — aucune vérification de permission organisation:member:*
 * n'est nécessaire : un utilisateur peut toujours consulter la liste de ses propres
 * appartenances (analogue à GET /auth/me côté Identity).
 */
@Injectable()
export class ListMyMembershipsUseCase {
  constructor(
    @Inject(MEMBERSHIP_REPOSITORY) private readonly membershipRepository: MembershipRepository,
    private readonly getOrganizationUseCase: GetOrganizationUseCase,
  ) {}

  async execute(query: ListMyMembershipsQuery): Promise<ListMyMembershipsResult> {
    const page = await this.membershipRepository.listByUser({
      userId: query.userId,
      cursor: query.cursor,
      limit: query.limit,
    });

    const items: MyMembershipView[] = [];

    for (const membership of page.items) {
      const organization = await this.tryGetOrganization(membership.organizationId);

      if (!organization) {
        continue;
      }

      items.push({
        ...toMembershipSummary(membership),
        organization: { id: organization.id, name: organization.name, slug: organization.slug },
      });
    }

    return { items, nextCursor: page.nextCursor };
  }

  private async tryGetOrganization(organizationId: string) {
    try {
      return await this.getOrganizationUseCase.execute({ id: organizationId });
    } catch {
      return null;
    }
  }
}
