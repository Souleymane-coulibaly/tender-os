import type { User } from "../domain/user.aggregate";

export type UserSummary = {
  id: string;
  email: string;
  displayName: string;
  firstName?: string | undefined;
  lastName?: string | undefined;
  status: string;
  emailVerifiedAt?: string | undefined;
  lastLoginAt?: string | undefined;
  createdAt: string;
};

export function toUserSummary(user: User): UserSummary {
  return {
    id: user.id.value,
    email: user.email.value,
    displayName: user.displayName,
    firstName: user.firstName,
    lastName: user.lastName,
    status: user.status,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString(),
    createdAt: user.createdAt.toISOString(),
  };
}
