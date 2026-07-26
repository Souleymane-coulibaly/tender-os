import type { UserSummary } from "../../application/dtos";
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
    createdAt: user.createdAt,
  };
}

export type AuthenticationResponse = Readonly<AuthenticateUserResult>;

export function presentAuthentication(result: AuthenticateUserResult): AuthenticationResponse {
  return {
    accessToken: result.accessToken,
    expiresAt: result.expiresAt,
    user: presentUser(result.user),
  };
}
