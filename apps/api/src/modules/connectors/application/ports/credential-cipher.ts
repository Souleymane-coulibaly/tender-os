/**
 * Mission §10 (POINT CRITIQUE) — chiffrement réversible des access/refresh tokens OAuth. Aucun
 * utilitaire de ce type n'existait dans le dépôt avant ce sprint (audit confirmé : `ApiKey` utilise
 * un hash à sens unique, `WebhookSubscription.secret` est en clair par nécessité HMAC — ni l'un ni
 * l'autre ne convient à un refresh token qu'il faut pouvoir relire en clair pour rappeler le
 * provider). Port dédié pour rester substituable (tests unitaires avec un chiffrement en mémoire,
 * production avec la clé applicative réelle) — jamais un appel direct à `crypto` dispersé dans les
 * use-cases.
 */
export interface CredentialCipher {
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
}

export const CREDENTIAL_CIPHER = Symbol("CREDENTIAL_CIPHER");
