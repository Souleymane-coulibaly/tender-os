import { beforeEach, describe, expect, it } from "vitest";
import {
  ACCEPT_ALL_CONSENT,
  CONSENT_STORAGE_KEY,
  readStoredConsent,
  REJECT_ALL_CONSENT,
  writeStoredConsent,
} from "./consent";

describe("consent storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns null when nothing is stored (first visit — banner must show)", () => {
    expect(readStoredConsent()).toBeNull();
  });

  it("round-trips a written consent decision", () => {
    writeStoredConsent(ACCEPT_ALL_CONSENT);

    const stored = readStoredConsent();
    expect(stored?.necessary).toBe(true);
    expect(stored?.analytics).toBe(true);
    expect(stored?.support).toBe(true);
  });

  it("returns null for a stored consent whose version no longer matches CONSENT_POLICY_VERSION (mission §41 — re-prompt on policy change)", () => {
    window.localStorage.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify({ version: 999, necessary: true, analytics: true, support: true, updatedAt: new Date().toISOString() }),
    );

    expect(readStoredConsent()).toBeNull();
  });

  it("returns null for corrupted/malformed stored data — never a crash", () => {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, "{not valid json");

    expect(readStoredConsent()).toBeNull();
  });

  it("REJECT_ALL_CONSENT never grants analytics or support", () => {
    writeStoredConsent(REJECT_ALL_CONSENT);

    const stored = readStoredConsent();
    expect(stored?.analytics).toBe(false);
    expect(stored?.support).toBe(false);
  });
});
