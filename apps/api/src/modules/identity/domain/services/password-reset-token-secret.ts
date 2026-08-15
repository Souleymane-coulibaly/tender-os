import { randomBytes, createHash } from "node:crypto";

const TOKEN_BYTE_LENGTH = 32;

/**
 * Même motif que `generateApiKey`/`hashApiKeySecret`
 * (modules/integrations/domain/services/api-key-secret.ts) : le jeton brut n'est JAMAIS
 * persisté, seul son hash SHA-256. SHA-256 est suffisant ici (contrairement à un mot de passe
 * humain) — le jeton source a 256 bits d'entropie générés cryptographiquement, aucune attaque
 * par dictionnaire n'est pertinente. Le hash servant de clé de recherche unique en base
 * (`findUnique` sur un index), aucune comparaison à temps constant supplémentaire n'est
 * nécessaire (contrairement à `verifyApiKeySecret`, qui compare deux valeurs déjà en mémoire).
 */
export type GeneratedPasswordResetToken = Readonly<{
  /** Valeur complète envoyée par email — jamais persistée. */
  token: string;
  /** Persisté à la place du jeton brut. */
  tokenHash: string;
}>;

export function generatePasswordResetToken(): GeneratedPasswordResetToken {
  const token = randomBytes(TOKEN_BYTE_LENGTH).toString("base64url");

  return { token, tokenHash: hashPasswordResetToken(token) };
}

export function hashPasswordResetToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
