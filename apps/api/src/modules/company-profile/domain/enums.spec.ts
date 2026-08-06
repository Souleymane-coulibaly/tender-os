import { describe, expect, it } from "vitest";
import { computeTemporalValidityStatus, TemporalValidityStatus } from "./enums";

describe("computeTemporalValidityStatus", () => {
  const now = new Date("2026-08-06T00:00:00.000Z");

  it("returns NO_EXPIRY when there is no expiry date (mission §4.6 certifications sans expiration)", () => {
    expect(computeTemporalValidityStatus(null, now)).toBe(TemporalValidityStatus.NoExpiry);
    expect(computeTemporalValidityStatus(undefined, now)).toBe(TemporalValidityStatus.NoExpiry);
  });

  it("returns EXPIRED for a past expiry date", () => {
    expect(computeTemporalValidityStatus(new Date("2026-01-01T00:00:00.000Z"), now)).toBe(TemporalValidityStatus.Expired);
  });

  it("returns EXPIRING_SOON within the 30-day window", () => {
    expect(computeTemporalValidityStatus(new Date("2026-08-20T00:00:00.000Z"), now)).toBe(TemporalValidityStatus.ExpiringSoon);
  });

  it("returns VALID beyond the 30-day window", () => {
    expect(computeTemporalValidityStatus(new Date("2027-01-01T00:00:00.000Z"), now)).toBe(TemporalValidityStatus.Valid);
  });

  it("is deterministic — never derived from anything other than expiresAt and now (mission: jamais un score inventé)", () => {
    const expiresAt = new Date("2026-09-01T00:00:00.000Z");
    const first = computeTemporalValidityStatus(expiresAt, now);
    const second = computeTemporalValidityStatus(expiresAt, now);
    expect(first).toBe(second);
  });
});
