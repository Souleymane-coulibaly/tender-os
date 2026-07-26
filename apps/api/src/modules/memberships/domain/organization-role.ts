import { InvalidOrganizationRoleError } from "./errors";

/**
 * Rôles d'organisation (bible/03-domain/business-rules.md §4 "Rôles initiaux").
 *
 * bible/03-domain/permissions.md §4 documente 8 rôles (avec "Approver") tandis que
 * business-rules.md §4 n'en documente que 7 (sans "Approver"). En cas de conflit,
 * `skills/platform-foundation/SECURITY_PATTERNS.md` §2 fixe l'ordre d'autorité :
 * business-rules.md prime sur permissions.md pour toute question de sécurité — ce
 * sont donc ces 7 rôles qui font foi ici, jusqu'à mise à jour officielle des documents.
 */
export const OrganizationRole = {
  OrganizationAdmin: "ORGANIZATION_ADMIN",
  BidManager: "BID_MANAGER",
  Contributor: "CONTRIBUTOR",
  Reviewer: "REVIEWER",
  Executive: "EXECUTIVE",
  ExternalConsultant: "EXTERNAL_CONSULTANT",
  ReadOnly: "READ_ONLY",
} as const;

export type OrganizationRole = (typeof OrganizationRole)[keyof typeof OrganizationRole];

export const ORGANIZATION_ROLE_NAMES: Record<OrganizationRole, string> = {
  [OrganizationRole.OrganizationAdmin]: "Organization Admin",
  [OrganizationRole.BidManager]: "Bid Manager",
  [OrganizationRole.Contributor]: "Contributor",
  [OrganizationRole.Reviewer]: "Reviewer",
  [OrganizationRole.Executive]: "Executive",
  [OrganizationRole.ExternalConsultant]: "External Consultant",
  [OrganizationRole.ReadOnly]: "Read Only",
};

export function isOrganizationRole(value: string): value is OrganizationRole {
  return Object.values(OrganizationRole).includes(value as OrganizationRole);
}

export function parseOrganizationRole(value: string): OrganizationRole {
  if (!isOrganizationRole(value)) {
    throw new InvalidOrganizationRoleError(value);
  }
  return value;
}
