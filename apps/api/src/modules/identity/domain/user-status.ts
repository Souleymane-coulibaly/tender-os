/**
 * docs/04-architecture/DATABASE_DESIGN.md §5.1 — statuts canoniques de `users`.
 */
export const UserStatus = {
  Invited: "INVITED",
  Active: "ACTIVE",
  Suspended: "SUSPENDED",
  Deactivated: "DEACTIVATED",
} as const;

export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];
