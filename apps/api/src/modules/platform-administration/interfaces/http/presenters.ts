import type { UserSummary } from "../../../identity";
import type { PlatformAuditLogRecord } from "../../application/ports/platform-audit-log.port";
import type { PlatformOrganizationView } from "../../application/use-cases/list-platform-organizations.use-case";
import type { GetPlatformMetricsResult } from "../../application/use-cases/get-platform-metrics.use-case";

/**
 * Liste blanche stricte des champs Organization visibles depuis le back-office plateforme
 * (mission Platform Administration, "Accès aux données clientes") : identifiants techniques,
 * nom, statut, dates, nombre de membres — jamais legalName/registrationNumber/countryCode/
 * defaultCurrency/defaultTimezone/settings, qui ne figurent pas dans la liste autorisée,
 * même si `PlatformOrganizationView` les porte en interne (skills/platform-foundation/
 * SECURITY_PATTERNS.md §33 — un DTO n'est jamais un passe-plat de l'entité complète).
 */
export type PlatformOrganizationResponse = Readonly<{
  id: string;
  name: string;
  slug: string;
  status: string;
  activeMemberCount: number;
  createdAt: string;
  updatedAt: string;
}>;

export function presentPlatformOrganization(organization: PlatformOrganizationView): PlatformOrganizationResponse {
  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    status: organization.status,
    activeMemberCount: organization.activeMemberCount,
    createdAt: organization.createdAt,
    updatedAt: organization.updatedAt,
  };
}

/**
 * Aucun champ de `UserSummary` n'est confidentiel au sens de la mission (pas de mot de
 * passe, cf. Identity Presenter) — reste toutefois un point de contrôle explicite.
 */
export type PlatformUserResponse = Readonly<UserSummary>;

export function presentPlatformUser(user: UserSummary): PlatformUserResponse {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    firstName: user.firstName,
    lastName: user.lastName,
    status: user.status,
    emailVerifiedAt: user.emailVerifiedAt,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

export type PlatformAuditLogResponse = PlatformAuditLogRecord;

export function presentPlatformAuditLog(entry: PlatformAuditLogRecord): PlatformAuditLogResponse {
  return entry;
}

export type PlatformMetricsResponse = GetPlatformMetricsResult;

export function presentPlatformMetrics(metrics: GetPlatformMetricsResult): PlatformMetricsResponse {
  return metrics;
}

export type PageResponse<T> = Readonly<{
  items: readonly T[];
  pageInfo: Readonly<{ hasNextPage: boolean; nextCursor: string | null }>;
}>;

export function presentPage<T>(items: readonly T[], nextCursor: string | null): PageResponse<T> {
  return { items, pageInfo: { hasNextPage: nextCursor !== null, nextCursor } };
}
