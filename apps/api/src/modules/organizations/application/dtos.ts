import type { Organization, OrganizationSettings } from "../domain/organization.aggregate";

export type OrganizationSummary = {
  id: string;
  name: string;
  slug: string;
  legalName?: string | undefined;
  registrationNumber?: string | undefined;
  countryCode?: string | undefined;
  defaultCurrency: string;
  defaultTimezone: string;
  status: string;
  settings: OrganizationSettings;
  createdAt: string;
  updatedAt: string;
};

export function toOrganizationSummary(organization: Organization): OrganizationSummary {
  return {
    id: organization.id.value,
    name: organization.name,
    slug: organization.slug.value,
    legalName: organization.legalName,
    registrationNumber: organization.registrationNumber,
    countryCode: organization.countryCode,
    defaultCurrency: organization.defaultCurrency,
    defaultTimezone: organization.defaultTimezone,
    status: organization.status,
    settings: organization.settings,
    createdAt: organization.createdAt.toISOString(),
    updatedAt: organization.updatedAt.toISOString(),
  };
}
