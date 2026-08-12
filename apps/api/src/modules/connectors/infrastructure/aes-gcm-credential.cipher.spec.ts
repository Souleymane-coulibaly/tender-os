import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { AesGcmCredentialCipher } from "./aes-gcm-credential.cipher";

describe("AesGcmCredentialCipher", () => {
  beforeEach(() => {
    process.env.CONNECTOR_CREDENTIAL_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  });

  it("round-trips plaintext through encrypt/decrypt", () => {
    const cipher = new AesGcmCredentialCipher();
    const plaintext = "a-very-secret-refresh-token-value";

    const ciphertext = cipher.encrypt(plaintext);

    expect(ciphertext).not.toContain(plaintext);
    expect(cipher.decrypt(ciphertext)).toBe(plaintext);
  });

  it("produces a different ciphertext each time (random IV), never a deterministic/comparable value", () => {
    const cipher = new AesGcmCredentialCipher();
    const plaintext = "same-token";

    expect(cipher.encrypt(plaintext)).not.toBe(cipher.encrypt(plaintext));
  });

  it("rejects a tampered ciphertext (GCM authentication tag fails)", () => {
    const cipher = new AesGcmCredentialCipher();
    const ciphertext = cipher.encrypt("token");
    const tampered = Buffer.from(ciphertext, "base64");
    tampered[tampered.length - 1] = (tampered[tampered.length - 1]! + 1) % 256;

    expect(() => cipher.decrypt(tampered.toString("base64"))).toThrow();
  });

  it("BLOQUANT — refuses to start without CONNECTOR_CREDENTIAL_ENCRYPTION_KEY (mission §10, never a silent default)", () => {
    delete process.env.CONNECTOR_CREDENTIAL_ENCRYPTION_KEY;
    expect(() => new AesGcmCredentialCipher()).toThrow(/Missing required environment variable/);
  });

  it("refuses a key that doesn't decode to exactly 32 bytes", () => {
    process.env.CONNECTOR_CREDENTIAL_ENCRYPTION_KEY = Buffer.from("too-short").toString("base64");
    expect(() => new AesGcmCredentialCipher()).toThrow(/32 bytes/);
  });
});
