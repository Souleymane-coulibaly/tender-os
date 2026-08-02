import { describe, expect, it } from "vitest";
import { loadSignatureConfig } from "./signature-config";

const ALPHA_ENV = {
  SIGNATURE_PROVIDER: "UNIVERSIGN",
  UNIVERSIGN_API_KEY: "test-key",
  UNIVERSIGN_API_BASE_URL: "https://api.alpha.universign.com",
  UNIVERSIGN_ENVIRONMENT: "ALPHA",
  UNIVERSIGN_RETURN_URL: "https://tenderos.example.com/return",
  UNIVERSIGN_CANCEL_URL: "https://tenderos.example.com/cancel",
  UNIVERSIGN_JWKS_URL: "https://api.alpha.universign.com/v1/webhooks/jwks.json",
};

describe("loadSignatureConfig", () => {
  it("throws when SIGNATURE_PROVIDER is missing or invalid", () => {
    expect(() => loadSignatureConfig({})).toThrow(/SIGNATURE_PROVIDER/);
    expect(() => loadSignatureConfig({ SIGNATURE_PROVIDER: "STRIPE" })).toThrow(/SIGNATURE_PROVIDER/);
  });

  it("accepts FAKE outside production", () => {
    expect(loadSignatureConfig({ SIGNATURE_PROVIDER: "FAKE" })).toEqual({ provider: "FAKE" });
    expect(loadSignatureConfig({ SIGNATURE_PROVIDER: "FAKE", NODE_ENV: "development" })).toEqual({ provider: "FAKE" });
    expect(loadSignatureConfig({ SIGNATURE_PROVIDER: "FAKE", NODE_ENV: "test" })).toEqual({ provider: "FAKE" });
  });

  it("mission (audit de correction) — refuses FAKE when NODE_ENV=production", () => {
    expect(() => loadSignatureConfig({ SIGNATURE_PROVIDER: "FAKE", NODE_ENV: "production" })).toThrow(/production/i);
  });

  it("refuses UNIVERSIGN_ENVIRONMENT=PRODUCTION regardless of NODE_ENV", () => {
    expect(() => loadSignatureConfig({ ...ALPHA_ENV, UNIVERSIGN_ENVIRONMENT: "PRODUCTION" })).toThrow(/Production/);
  });

  it("loads a full UNIVERSIGN/ALPHA configuration when every required variable is present", () => {
    const config = loadSignatureConfig(ALPHA_ENV);
    expect(config.provider).toBe("UNIVERSIGN");
    expect(config.universign?.environment).toBe("ALPHA");
    expect(config.universign?.apiBaseUrl).toBe("https://api.alpha.universign.com");
  });

  it("throws when a required UNIVERSIGN variable is missing", () => {
    const { UNIVERSIGN_API_KEY: _omit, ...withoutApiKey } = ALPHA_ENV;
    expect(() => loadSignatureConfig(withoutApiKey)).toThrow(/UNIVERSIGN_API_KEY/);
  });
});
