import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateWebhookSecret, signWebhookPayload, verifyWebhookSignature } from "./webhook-signature";

describe("webhook-signature", () => {
  const secret = "whsec_test-secret";
  const timestampSeconds = 1_700_000_000;
  const rawBody = JSON.stringify({ id: "evt_1", type: "response_package.validated", data: { id: "pkg_1" } });

  it("produces a reproducible HMAC-SHA256 hex signature (mission §28, verifiable independently)", () => {
    const signature = signWebhookPayload({ secret, timestampSeconds, rawBody });
    expect(signature).toMatch(/^[0-9a-f]{64}$/);

    const expected = createHmac("sha256", secret).update(`${timestampSeconds}.${rawBody}`, "utf8").digest("hex");
    expect(signature).toBe(expected);
  });

  it("verifies its own signature", () => {
    const signature = signWebhookPayload({ secret, timestampSeconds, rawBody });
    expect(verifyWebhookSignature({ secret, timestampSeconds, rawBody, signature })).toBe(true);
  });

  it("BLOQUANT — tampering the body after signing invalidates the signature", () => {
    const signature = signWebhookPayload({ secret, timestampSeconds, rawBody });
    const tamperedBody = rawBody.replace("pkg_1", "pkg_2");
    expect(verifyWebhookSignature({ secret, timestampSeconds, rawBody: tamperedBody, signature })).toBe(false);
  });

  it("rejects a signature computed with the wrong secret", () => {
    const signature = signWebhookPayload({ secret: "whsec_other", timestampSeconds, rawBody });
    expect(verifyWebhookSignature({ secret, timestampSeconds, rawBody, signature })).toBe(false);
  });

  it("rejects a signature computed with a different timestamp", () => {
    const signature = signWebhookPayload({ secret, timestampSeconds, rawBody });
    expect(verifyWebhookSignature({ secret, timestampSeconds: timestampSeconds + 1, rawBody, signature })).toBe(false);
  });

  it("generateWebhookSecret produces a unique, prefixed, high-entropy secret", () => {
    const a = generateWebhookSecret();
    const b = generateWebhookSecret();
    expect(a).toMatch(/^whsec_/);
    expect(a).not.toBe(b);
  });
});
