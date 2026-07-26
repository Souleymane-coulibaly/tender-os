import { Inject, Injectable } from "@nestjs/common";
import type { OrganizationStatus } from "../../domain/organization-status";
import { toOrganizationSummary, type OrganizationSummary } from "../dtos";
import { ORGANIZATION_REPOSITORY, type OrganizationRepository } from "../ports/organization.repository";

export type ListOrganizationsQuery = Readonly<{
  cursor?: string | undefined;
  limit: number;
  status?: OrganizationStatus | undefined;
}>;

export type ListOrganizationsResult = Readonly<{
  items: OrganizationSummary[];
  nextCursor: string | null;
}>;

/**
 * Listing multi-tenant (toutes les organisations, tous tenants confondus) — usage
 * réservé aux consommateurs habilités à parcourir l'ensemble de la plateforme
 * (ex. Platform Administration), jamais exposé à un acteur tenant ordinaire.
 */
@Injectable()
export class ListOrganizationsUseCase {
  constructor(
    @Inject(ORGANIZATION_REPOSITORY) private readonly organizationRepository: OrganizationRepository,
  ) {}

  async execute(query: ListOrganizationsQuery): Promise<ListOrganizationsResult> {
    const page = await this.organizationRepository.list({
      cursor: query.cursor,
      limit: query.limit,
      status: query.status,
    });

    return {
      items: page.items.map(toOrganizationSummary),
      nextCursor: page.nextCursor,
    };
  }
}
