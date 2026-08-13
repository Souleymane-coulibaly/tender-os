import { describe, expect, it } from "vitest";
import { redact } from "./log-redaction";

describe("redact", () => {
  it("redacts a known sensitive key (case-insensitive), regardless of nesting", () => {
    const input = { headers: { Authorization: "Bearer abc123", "x-request-id": "keep-me" } };

    const result = redact(input) as { headers: { Authorization: string; "x-request-id": string } };

    expect(result.headers.Authorization).toBe("[REDACTED]");
    expect(result.headers["x-request-id"]).toBe("keep-me");
  });

  it("redacts cookie/set-cookie/api-key/webhook-secret/password fields", () => {
    const input = { cookie: "session=abc", apiKey: "k1", webhookSecret: "s1", password: "p1", unrelated: "kept" };

    const result = redact(input) as Record<string, unknown>;

    expect(result.cookie).toBe("[REDACTED]");
    expect(result.apiKey).toBe("[REDACTED]");
    expect(result.webhookSecret).toBe("[REDACTED]");
    expect(result.password).toBe("[REDACTED]");
    expect(result.unrelated).toBe("kept");
  });

  it("redacts a Stripe-style secret key even when embedded inside a free-text string (e.g. a provider error message)", () => {
    const message = "AI provider returned HTTP 401: invalid key sk_live_abcdefghijklmnop for this request";

    const result = redact(message) as string;

    expect(result).not.toContain("sk_live_abcdefghijklmnop");
    expect(result).toContain("[REDACTED]");
  });

  it("redacts a webhook secret (whsec_...) embedded in free text", () => {
    const message = "Signature verification failed using whsec_1234567890abcdef";

    const result = redact(message) as string;

    expect(result).not.toContain("whsec_1234567890abcdef");
  });

  it("redacts a raw Bearer token appearing in free text", () => {
    const message = "Outbound request failed: Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc.def";

    const result = redact(message) as string;

    expect(result).not.toContain("eyJhbGciOiJIUzI1NiJ9");
  });

  it("never redacts an unrelated field whose name only superficially resembles a sensitive one", () => {
    const input = { organizationId: "org-1", userId: "user-1", requestId: "req-1" };

    const result = redact(input) as Record<string, unknown>;

    expect(result).toEqual(input);
  });

  it("recurses through arrays", () => {
    const input = [{ password: "p1" }, { organizationId: "org-1" }];

    const result = redact(input) as Record<string, unknown>[];

    expect(result[0]?.password).toBe("[REDACTED]");
    expect(result[1]?.organizationId).toBe("org-1");
  });

  it("never throws on a pathologically deep structure — caps recursion instead", () => {
    let deep: unknown = { password: "leaf" };
    for (let i = 0; i < 20; i++) {
      deep = { nested: deep };
    }

    expect(() => redact(deep)).not.toThrow();
  });
});
