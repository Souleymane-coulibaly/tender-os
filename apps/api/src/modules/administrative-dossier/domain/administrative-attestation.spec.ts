import { describe, expect, it } from "vitest";
import { AdministrativeAttestationStatus, deriveAttestationStatus } from "./administrative-attestation";

const NOW = new Date("2026-09-10T10:00:00.000Z");

describe("deriveAttestationStatus — mission §16 'la présence d'un fichier ne suffit jamais à rendre une attestation valide'", () => {
  it("returns NOT_VERIFIED when no revision is validated, regardless of files present", () => {
    expect(deriveAttestationStatus({ hasValidatedRevision: false, latestRevisionRejected: false, now: NOW })).toBe(AdministrativeAttestationStatus.NotVerified);
  });

  it("returns REJECTED when the latest revision was rejected and nothing else was ever validated", () => {
    expect(deriveAttestationStatus({ hasValidatedRevision: false, latestRevisionRejected: true, now: NOW })).toBe(AdministrativeAttestationStatus.Rejected);
  });

  it("returns VALID when validated and no expiry set", () => {
    expect(deriveAttestationStatus({ hasValidatedRevision: true, latestRevisionRejected: false, now: NOW })).toBe(AdministrativeAttestationStatus.Valid);
  });

  it("returns EXPIRED when the validated revision's expiry date is in the past", () => {
    expect(deriveAttestationStatus({ hasValidatedRevision: true, latestRevisionRejected: false, expiresAt: new Date("2026-01-01"), now: NOW })).toBe(AdministrativeAttestationStatus.Expired);
  });

  it("returns EXPIRING_SOON when expiry falls within the configurable window", () => {
    const soon = new Date(NOW.getTime() + 5 * 24 * 60 * 60 * 1000);
    expect(deriveAttestationStatus({ hasValidatedRevision: true, latestRevisionRejected: false, expiresAt: soon, now: NOW, expiringSoonWindowDays: 30 })).toBe(
      AdministrativeAttestationStatus.ExpiringSoon,
    );
  });

  it("returns EXPIRING_SOON when the attestation expires before the tender deadline, even outside the default window", () => {
    const expiresAt = new Date(NOW.getTime() + 200 * 24 * 60 * 60 * 1000);
    const tenderDeadline = new Date(NOW.getTime() + 250 * 24 * 60 * 60 * 1000);
    expect(deriveAttestationStatus({ hasValidatedRevision: true, latestRevisionRejected: false, expiresAt, now: NOW, tenderDeadline })).toBe(AdministrativeAttestationStatus.ExpiringSoon);
  });

  it("stays VALID when expiry is far beyond both the window and the tender deadline", () => {
    const expiresAt = new Date(NOW.getTime() + 400 * 24 * 60 * 60 * 1000);
    const tenderDeadline = new Date(NOW.getTime() + 100 * 24 * 60 * 60 * 1000);
    expect(deriveAttestationStatus({ hasValidatedRevision: true, latestRevisionRejected: false, expiresAt, now: NOW, tenderDeadline })).toBe(AdministrativeAttestationStatus.Valid);
  });
});
