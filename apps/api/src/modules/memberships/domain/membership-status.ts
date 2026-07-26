/**
 * docs/04-architecture/DATABASE_DESIGN.md §5.3 — statuts canoniques de `organization_memberships`.
 */
export const MembershipStatus = {
  Invited: "INVITED",
  Active: "ACTIVE",
  Suspended: "SUSPENDED",
  Expired: "EXPIRED",
  Removed: "REMOVED",
} as const;

export type MembershipStatus = (typeof MembershipStatus)[keyof typeof MembershipStatus];
