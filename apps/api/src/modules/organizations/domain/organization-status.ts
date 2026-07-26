/**
 * docs/04-architecture/DATABASE_DESIGN.md §5.2 — statuts canoniques de `organizations`.
 */
export const OrganizationStatus = {
  Trial: "TRIAL",
  Active: "ACTIVE",
  Suspended: "SUSPENDED",
  Closed: "CLOSED",
} as const;

export type OrganizationStatus = (typeof OrganizationStatus)[keyof typeof OrganizationStatus];
