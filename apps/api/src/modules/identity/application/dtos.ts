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
  /** V2 Sprint 24 (onboarding, CGU) — permet au frontend de savoir si l'utilisateur courant a
   *  déjà accepté la version actuelle des CGU (`TERMS_VERSION`) sans jamais lui redemander
   *  pendant une reprise d'onboarding ou à chaque connexion. */
  termsAcceptedVersion?: string | undefined;
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
    termsAcceptedVersion: user.termsAcceptedVersion,
    createdAt: user.createdAt.toISOString(),
  };
}
