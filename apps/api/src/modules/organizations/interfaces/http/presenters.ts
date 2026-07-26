import type { OrganizationSummary } from "../../application/dtos";

/**
 * Point de contrôle unique des champs exposés (skills/platform-foundation/API_PATTERNS.md §32).
 */
export type OrganizationResponse = Readonly<OrganizationSummary>;

export function presentOrganization(organization: OrganizationSummary): OrganizationResponse {
  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    legalName: organization.legalName,
    registrationNumber: organization.registrationNumber,
    countryCode: organization.countryCode,
    defaultCurrency: organization.defaultCurrency,
    defaultTimezone: organization.defaultTimezone,
    status: organization.status,
    settings: organization.settings,
    createdAt: organization.createdAt,
    updatedAt: organization.updatedAt,
  };
}
