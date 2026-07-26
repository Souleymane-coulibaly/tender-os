import type { Organization } from "../../domain/organization.aggregate";
import type { OrganizationId } from "../../domain/organization-id.value-object";
import type { OrganizationSlug } from "../../domain/organization-slug.value-object";
import type { OrganizationStatus } from "../../domain/organization-status";

export type OrganizationPage = {
  items: Organization[];
  nextCursor: string | null;
};

/**
 * `organizations` est l'agrégat racine du tenant — pas de scoping par organizationId ici
 * (docs/04-architecture/DATABASE_DESIGN.md §5.2). Les lectures excluent les organisations
 * marquées supprimées (deletedAt non nul) — voir bible/03-domain/business-rules.md BR-GEN-003.
 */
export interface OrganizationRepository {
  findById(id: OrganizationId): Promise<Organization | null>;
  findBySlug(slug: OrganizationSlug): Promise<Organization | null>;
  list(input: {
    cursor?: string | undefined;
    limit: number;
    status?: OrganizationStatus | undefined;
  }): Promise<OrganizationPage>;
  countByStatus(): Promise<Record<OrganizationStatus, number>>;
  save(organization: Organization): Promise<void>;
}

export const ORGANIZATION_REPOSITORY = Symbol("ORGANIZATION_REPOSITORY");
