import { createLocalJWKSet, exportJWK, FlattenedSign, generateKeyPair, type KeyLike } from "jose";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { UniversignWebhookVerifier } from "./universign-webhook-verifier";

/**
 * Test CONTRACTUEL (mission Sprint 8A §76/§57) — fondé sur le format documenté (JWS détachée,
 * PS256, JWKS) : vérifie la LOGIQUE de vérification avec une paire de clés générée localement,
 * jamais un appel réel à Universign (accès indisponible, voir rapport §Z
 * BLOCKED_BY_UNIVERSIGN_ACCESS). Ne prétend PAS prouver que cela fonctionne avec les clés
 * publiques RÉELLES d'Universign — seule la structure de vérification est prouvée ici.
 */
describe("UniversignWebhookVerifier (test contractuel — clés locales, jamais Universign réel)", () => {
  let publicKey: KeyLike;
  let privateKey: KeyLike;
  let kid: string;

  beforeAll(async () => {
    const keyPair = await generateKeyPair("PS256");
    publicKey = keyPair.publicKey;
    privateKey = keyPair.privateKey;
    kid = "test-key-1";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function buildVerifierWithLocalJwks() {
    const jwk = await exportJWK(publicKey);
    const jwks = { keys: [{ ...jwk, kid, alg: "PS256", use: "sig" }] };
    // `createLocalJWKSet` a la même interface d'utilisation que `createRemoteJWKSet` pour
    // `flattenedVerify` — substitué ici uniquement pour éviter un appel réseau réel dans le test.
    const verifier = new UniversignWebhookVerifier({
      apiKey: "test",
      apiBaseUrl: "https://api.alpha.universign.com",
      environment: "ALPHA",
      returnUrl: "https://example.com/return",
      cancelUrl: "https://example.com/cancel",
      jwksUrl: "https://api.alpha.universign.com/v1/webhooks/jwks.json",
      requestTimeoutMs: 5000,
    });
    // Remplace le JWKS distant par le JWKS local pour ce test (même clé publique).
    (verifier as unknown as { jwks: unknown }).jwks = createLocalJWKSet(jwks);
    return verifier;
  }

  async function signDetached(payload: Buffer): Promise<string> {
    const jws = await new FlattenedSign(payload).setProtectedHeader({ alg: "PS256", kid }).sign(privateKey);
    // Format détaché RFC 7515 : header.[payload vide].signature — le header x-jws-signature
    // transmis par Universign porte header + signature, jamais le payload (mission §39/§45).
    return `${jws.protected}..${jws.signature}`;
  }

  it("accepts a validly signed detached JWS matching the actual raw body", async () => {
    const verifier = await buildVerifierWithLocalJwks();
    const rawBody = Buffer.from(JSON.stringify({ type: "transaction.lifecycle.completed", id: "evt_1" }));
    const header = await signDetached(rawBody);

    const result = await verifier.verify({ rawBody, signatureHeader: header });
    expect(result.valid).toBe(true);
  });

  it("rejects a payload that was tampered with after signing", async () => {
    const verifier = await buildVerifierWithLocalJwks();
    const rawBody = Buffer.from(JSON.stringify({ type: "transaction.lifecycle.completed", id: "evt_1" }));
    const header = await signDetached(rawBody);

    const tamperedBody = Buffer.from(JSON.stringify({ type: "transaction.lifecycle.completed", id: "evt_2" }));
    const result = await verifier.verify({ rawBody: tamperedBody, signatureHeader: header });
    expect(result.valid).toBe(false);
  });

  it("rejects a malformed header (not 3 dot-separated parts)", async () => {
    const verifier = await buildVerifierWithLocalJwks();
    const result = await verifier.verify({ rawBody: Buffer.from("{}"), signatureHeader: "not-a-jws" });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toContain("malformed");
  });

  it("rejects a signature produced by an unknown key (kid not in JWKS)", async () => {
    const otherKeyPair = await generateKeyPair("PS256");
    const jws = await new FlattenedSign(Buffer.from("{}")).setProtectedHeader({ alg: "PS256", kid: "unknown-key" }).sign(otherKeyPair.privateKey);
    const header = `${jws.protected}..${jws.signature}`;

    const verifier = await buildVerifierWithLocalJwks();
    const result = await verifier.verify({ rawBody: Buffer.from("{}"), signatureHeader: header });
    expect(result.valid).toBe(false);
  });
});
