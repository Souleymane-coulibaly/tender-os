export type AccessTokenClaims = {
  userId: string;
  sessionId: string;
};

/**
 * bible/04-architecture/system-architecture.md §14 — IdentityProvider.verifyAccessToken.
 * L'authentification reste isolée derrière cette abstraction ; aucun autre composant
 * ne dépend directement d'un mécanisme de jeton particulier.
 */
export interface AccessTokenService {
  issue(claims: AccessTokenClaims, ttlSeconds: number): string;
  verify(token: string): AccessTokenClaims | null;
}

export const ACCESS_TOKEN_SERVICE = Symbol("ACCESS_TOKEN_SERVICE");
