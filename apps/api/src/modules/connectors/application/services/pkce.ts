import { createHash, randomBytes } from "node:crypto";

/** Mission §7/§8 — `state` opaque (256 bits) et PKCE S256 (mission §8 "auditer si PKCE est
 *  pertinent avec l'architecture retenue... l'utiliser si adapté" — un client confidentiel côté
 *  serveur n'a pas STRICTEMENT besoin de PKCE, mais l'ajouter coûte peu et ferme la classe entière
 *  d'attaques par interception du code d'autorisation, cohérent avec la posture "least privilege /
 *  defense in depth" du reste du module). */
export function generateOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

export function generatePkceCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

export function derivePkceCodeChallenge(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier).digest("base64url");
}

export const OAUTH_FLOW_STATE_TTL_MS = 10 * 60 * 1000;
