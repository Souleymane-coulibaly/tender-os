import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

const SECRET_BYTE_LENGTH = 32;
const PREFIX_LABEL = "tos_live_";
/** Portion du secret conservée en clair dans `keyPrefix` pour un lookup O(1) et l'affichage UI
 *  ("tos_live_ab12cd34…") — jamais assez d'entropie retrouvée pour reconstituer le secret complet
 *  (256 bits générés, 6 caractères ~36 bits exposés). */
const PREFIX_VISIBLE_CHARS = 8;

export type GeneratedApiKey = Readonly<{
  /** Valeur complète affichée UNE SEULE FOIS à la création (mission §10/§11) — jamais persistée. */
  fullKey: string;
  /** Persisté en clair — lookup + affichage partiel dans l'UI (mission §51 "Prefix"). */
  keyPrefix: string;
  /** Persisté à la place du secret (mission §10 "ne jamais stocker la clé brute si évitable"). */
  keyHash: string;
}>;

function base64UrlEncode(buffer: Buffer): string {
  return buffer.toString("base64url");
}

export function generateApiKey(): GeneratedApiKey {
  const secret = base64UrlEncode(randomBytes(SECRET_BYTE_LENGTH));
  const fullKey = `${PREFIX_LABEL}${secret}`;
  const keyPrefix = fullKey.slice(0, PREFIX_LABEL.length + PREFIX_VISIBLE_CHARS);
  return { fullKey, keyPrefix, keyHash: hashApiKeySecret(fullKey) };
}

/** SHA-256 est suffisant ici (contrairement à un mot de passe humain) : le secret source a 256
 *  bits d'entropie générés cryptographiquement, aucune attaque par dictionnaire n'est pertinente —
 *  même raisonnement que Stripe/GitHub pour leurs clés API. */
export function hashApiKeySecret(fullKey: string): string {
  return createHash("sha256").update(fullKey, "utf8").digest("hex");
}

/** Comparaison à temps constant (mission — jamais une simple `===` sur un secret). */
export function verifyApiKeySecret(fullKey: string, expectedHash: string): boolean {
  const actualHash = hashApiKeySecret(fullKey);
  const actual = Buffer.from(actualHash, "hex");
  const expected = Buffer.from(expectedHash, "hex");
  if (actual.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(actual, expected);
}

export function extractApiKeyPrefix(fullKey: string): string | undefined {
  if (!fullKey.startsWith(PREFIX_LABEL)) {
    return undefined;
  }
  return fullKey.slice(0, PREFIX_LABEL.length + PREFIX_VISIBLE_CHARS);
}
