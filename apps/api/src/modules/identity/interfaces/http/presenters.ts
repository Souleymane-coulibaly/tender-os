import type { PageGuideStateSummary, UserSummary } from "../../application/dtos";
import type { AuthenticateUserResult } from "../../application/use-cases/authenticate-user.use-case";

/**
 * Point de contrôle unique des champs exposés (skills/platform-foundation/API_PATTERNS.md §32) —
 * garantit qu'aucun champ sensible (ex. passwordHash, absent de UserSummary) ne fuit,
 * même si le Domain ou l'Application évoluent.
 */
export type UserResponse = Readonly<UserSummary>;

export function presentUser(user: UserSummary): UserResponse {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    firstName: user.firstName,
    lastName: user.lastName,
    status: user.status,
    emailVerifiedAt: user.emailVerifiedAt,
    lastLoginAt: user.lastLoginAt,
    termsAcceptedVersion: user.termsAcceptedVersion,
    tourStartedAt: user.tourStartedAt,
    tourCompletedAt: user.tourCompletedAt,
    tourDismissedAt: user.tourDismissedAt,
    createdAt: user.createdAt,
  };
}

/** TENDEROS-2.1 (guides de page) — liste blanche explicite ; une date absente est omise, jamais
 *  `null` (contrat de l'application web). */
export type PageGuideStateResponse = Readonly<PageGuideStateSummary>;
export type PageGuideStateListResponse = Readonly<{ items: PageGuideStateResponse[] }>;

export function presentPageGuideState(state: PageGuideStateSummary): PageGuideStateResponse {
  return {
    guideKey: state.guideKey,
    ...(state.completedAt !== undefined ? { completedAt: state.completedAt } : {}),
    ...(state.dismissedAt !== undefined ? { dismissedAt: state.dismissedAt } : {}),
  };
}

export function presentPageGuideStates(states: PageGuideStateSummary[]): PageGuideStateListResponse {
  return { items: states.map(presentPageGuideState) };
}

export type AuthenticationResponse = Readonly<AuthenticateUserResult>;

export function presentAuthentication(result: AuthenticateUserResult): AuthenticationResponse {
  return {
    accessToken: result.accessToken,
    expiresAt: result.expiresAt,
    user: presentUser(result.user),
  };
}
