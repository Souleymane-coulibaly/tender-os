import { describe, expect, it } from "vitest";
import { isEmailStrictEnvironment, resolveEmailProviderKind } from "./email-config";

describe("isEmailStrictEnvironment — P2 (audit Codex, Resend/Demo Request)", () => {
  it("is lenient when NODE_ENV is development", () => {
    expect(isEmailStrictEnvironment({ NODE_ENV: "development" })).toBe(false);
  });

  it("is lenient when NODE_ENV is test", () => {
    expect(isEmailStrictEnvironment({ NODE_ENV: "test" })).toBe(false);
  });

  it("is lenient when NODE_ENV is not set at all (never breaks a fresh local clone)", () => {
    expect(isEmailStrictEnvironment({})).toBe(false);
  });

  it("is strict for any other explicit NODE_ENV value (production, staging, ...)", () => {
    expect(isEmailStrictEnvironment({ NODE_ENV: "production" })).toBe(true);
    expect(isEmailStrictEnvironment({ NODE_ENV: "staging" })).toBe(true);
  });
});

describe("resolveEmailProviderKind — P2 (audit Codex, Resend/Demo Request)", () => {
  it("mission §27/§28 — local/test without Resend keys resolves to logging, never throws", () => {
    expect(resolveEmailProviderKind({ NODE_ENV: "development" })).toBe("logging");
    expect(resolveEmailProviderKind({ NODE_ENV: "test" })).toBe("logging");
  });

  it("local/test with both Resend keys present resolves to resend", () => {
    expect(resolveEmailProviderKind({ NODE_ENV: "development", RESEND_API_KEY: "re_123", RESEND_FROM_EMAIL: "a@b.com" })).toBe("resend");
  });

  it("BLOQUANT — mission §29/§30 staging/production without RESEND_API_KEY throws, never falls back to logging", () => {
    expect(() => resolveEmailProviderKind({ NODE_ENV: "staging", RESEND_FROM_EMAIL: "a@b.com" })).toThrow(/RESEND_API_KEY/);
    expect(() => resolveEmailProviderKind({ NODE_ENV: "production", RESEND_FROM_EMAIL: "a@b.com" })).toThrow(/RESEND_API_KEY/);
  });

  it("BLOQUANT — mission §31 staging/production without RESEND_FROM_EMAIL throws", () => {
    expect(() => resolveEmailProviderKind({ NODE_ENV: "production", RESEND_API_KEY: "re_123" })).toThrow(/RESEND_FROM_EMAIL/);
  });

  it("mission §33 — staging/production with both keys resolves to resend", () => {
    expect(resolveEmailProviderKind({ NODE_ENV: "production", RESEND_API_KEY: "re_123", RESEND_FROM_EMAIL: "a@b.com" })).toBe("resend");
  });

  it("never includes the actual key value in its error message", () => {
    try {
      resolveEmailProviderKind({ NODE_ENV: "production", RESEND_API_KEY: "re_super_secret_value" });
      expect.fail("expected resolveEmailProviderKind to throw");
    } catch (error) {
      expect(error instanceof Error ? error.message : String(error)).not.toContain("re_super_secret_value");
    }
  });
});
