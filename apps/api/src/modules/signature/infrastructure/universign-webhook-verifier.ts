import { Injectable } from "@nestjs/common";
import { base64url, createRemoteJWKSet, flattenedVerify } from "jose";
import type { SignatureWebhookVerifierPort, WebhookVerificationResult } from "../application/ports/signature-webhook-verifier.port";
import type { LoadedSignatureConfig } from "./signature-config";

/**
 * Mission Sprint 8A §39/§45 — vérification RÉELLE, fondée sur la documentation officielle
 * (rapport §D) : le header `x-jws-signature` porte une JWS (RFC 7515) à CONTENU DÉTACHÉ, algorithme
 * PS256, clés publiques exposées en JWKS à `{baseUrl}/v1/webhooks/jwks.json`. La vérification
 * reconstruit l'entrée de signature à partir du header ET du corps HTTP brut réellement reçu —
 * jamais une confiance dans le seul JSON désérialisé (mission §44).
 */
@Injectable()
export class UniversignWebhookVerifier implements SignatureWebhookVerifierPort {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(private readonly config: NonNullable<LoadedSignatureConfig["universign"]>) {
    this.jwks = createRemoteJWKSet(new URL(config.jwksUrl));
  }

  async verify(input: { rawBody: Buffer; signatureHeader: string }): Promise<WebhookVerificationResult> {
    const parts = input.signatureHeader.split(".");
    if (parts.length !== 3) {
      return { valid: false, reason: "malformed JWS header (expected 3 dot-separated parts)" };
    }
    const protectedHeader = parts[0]!;
    const signature = parts[2]!;

    try {
      // Mission §39/§45 — JWS DÉTACHÉE standard (RFC 7515, sans "b64":false) : jose exige la
      // valeur BASE64URL(payload) explicitement, jamais les octets bruts (vérifié empiriquement —
      // passer un Buffer brut fait échouer la vérification même pour une signature valide).
      const { protectedHeader: verifiedHeader, payload } = await flattenedVerify(
        { protected: protectedHeader, payload: base64url.encode(input.rawBody), signature },
        this.jwks,
      );

      if (!verifiedHeader || verifiedHeader.alg !== "PS256") {
        return { valid: false, reason: `unexpected algorithm "${verifiedHeader?.alg}", expected PS256` };
      }

      return { valid: true, payload: JSON.parse(Buffer.from(payload).toString("utf-8")) };
    } catch (error) {
      return { valid: false, reason: error instanceof Error ? error.message : "signature verification failed" };
    }
  }
}
