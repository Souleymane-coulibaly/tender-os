import type { Organization as OrganizationRecord, Prisma } from "@prisma/client";
import { Organization, type OrganizationSettings } from "../domain/organization.aggregate";
import { OrganizationId } from "../domain/organization-id.value-object";
import { OrganizationSlug } from "../domain/organization-slug.value-object";
import type { OrganizationStatus } from "../domain/organization-status";

export type OrganizationPersistenceData = {
  id: string;
  name: string;
  slug: string;
  legalName: string | null;
  registrationNumber: string | null;
  countryCode: string | null;
  defaultCurrency: string;
  defaultTimezone: string;
  status: string;
  settings: Prisma.InputJsonValue;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

/**
 * Traduit entre le modèle Prisma (Infrastructure) et l'agrégat Domain — Prisma ne
 * traverse jamais cette frontière (skills/platform-foundation/ARCHITECTURE_RULES.md §17.2).
 */
export class OrganizationPersistenceMapper {
  toDomain(record: OrganizationRecord): Organization {
    return Organization.rehydrate({
      id: OrganizationId.from(record.id),
      name: record.name,
      slug: OrganizationSlug.create(record.slug),
      legalName: record.legalName ?? undefined,
      registrationNumber: record.registrationNumber ?? undefined,
      countryCode: record.countryCode ?? undefined,
      defaultCurrency: record.defaultCurrency,
      defaultTimezone: record.defaultTimezone,
      status: record.status as OrganizationStatus,
      settings: (record.settings as OrganizationSettings | null) ?? {},
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      deletedAt: record.deletedAt ?? undefined,
    });
  }

  toPersistence(organization: Organization): OrganizationPersistenceData {
    return {
      id: organization.id.value,
      name: organization.name,
      slug: organization.slug.value,
      legalName: organization.legalName ?? null,
      registrationNumber: organization.registrationNumber ?? null,
      countryCode: organization.countryCode ?? null,
      defaultCurrency: organization.defaultCurrency,
      defaultTimezone: organization.defaultTimezone,
      status: organization.status,
      settings: organization.settings as Prisma.InputJsonValue,
      createdAt: organization.createdAt,
      updatedAt: organization.updatedAt,
      deletedAt: organization.deletedAt ?? null,
    };
  }
}
