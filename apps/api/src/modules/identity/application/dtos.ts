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
  /** V2 Sprint 25 (Guide interactif) — mission §25.72 "première arrivée" : le frontend décide
   *  d'afficher "Bienvenue dans TenderOS" quand les trois sont absents, jamais un second état de
   *  progression persisté côté client. */
  tourStartedAt?: string | undefined;
  tourCompletedAt?: string | undefined;
  tourDismissedAt?: string | undefined;
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
    tourStartedAt: user.tourStartedAt?.toISOString(),
    tourCompletedAt: user.tourCompletedAt?.toISOString(),
    tourDismissedAt: user.tourDismissedAt?.toISOString(),
    createdAt: user.createdAt.toISOString(),
  };
}
