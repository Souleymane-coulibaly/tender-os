export type WebhookVerificationResult =
  | Readonly<{ valid: true; payload: unknown }>
  | Readonly<{ valid: false; reason: string }>;

/**
 * Mission Sprint 8A §39/§45 — vérification cryptographique RÉELLE du webhook (JWS détaché,
 * PS256, clés publiques JWKS Universign — rapport §D). Jamais une confiance dans le seul JSON
 * reçu (mission §44 "ne valide jamais un document uniquement sur la base du JSON reçu").
 */
export interface SignatureWebhookVerifierPort {
  verify(input: { rawBody: Buffer; signatureHeader: string }): Promise<WebhookVerificationResult>;
}

export const SIGNATURE_WEBHOOK_VERIFIER_PORT = Symbol("SIGNATURE_WEBHOOK_VERIFIER_PORT");
