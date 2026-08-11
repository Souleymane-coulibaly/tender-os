import { describe, expect, it } from "vitest";
import { generateApiKey, hashApiKeySecret, verifyApiKeySecret } from "./api-key-secret";

describe("generateApiKey", () => {
  it("produces a full key starting with the documented prefix, never equal to the stored hash", () => {
    const generated = generateApiKey();
    expect(generated.fullKey).toMatch(/^tos_live_/);
    expect(generated.keyPrefix).toMatch(/^tos_live_/);
    expect(generated.fullKey).not.toBe(generated.keyHash);
    expect(generated.fullKey.startsWith(generated.keyPrefix)).toBe(true);
  });

  it("BLOQUANT — never stores the raw secret as the hash (mission §10/§97)", () => {
    const generated = generateApiKey();
    expect(generated.keyHash).not.toContain(generated.fullKey);
    expect(generated.keyHash).toHaveLength(64); // sha256 hex
  });

  it("generates a different secret on every call", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.fullKey).not.toBe(b.fullKey);
  });
});

describe("verifyApiKeySecret", () => {
  it("accepts the correct secret against its own hash", () => {
    const generated = generateApiKey();
    expect(verifyApiKeySecret(generated.fullKey, generated.keyHash)).toBe(true);
  });

  it("rejects an incorrect secret", () => {
    const generated = generateApiKey();
    expect(verifyApiKeySecret("tos_live_wrong-secret-value", generated.keyHash)).toBe(false);
  });

  it("rejects a tampered hash of a different length without throwing", () => {
    const generated = generateApiKey();
    expect(verifyApiKeySecret(generated.fullKey, "abcd")).toBe(false);
  });

  it("is consistent with hashApiKeySecret", () => {
    const generated = generateApiKey();
    expect(hashApiKeySecret(generated.fullKey)).toBe(generated.keyHash);
  });
});
