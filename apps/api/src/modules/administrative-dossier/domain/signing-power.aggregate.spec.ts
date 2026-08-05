import { describe, expect, it } from "vitest";
import { SigningPower } from "./signing-power.aggregate";
import { deriveSigningPowerStatus, SigningPowerStatus } from "./signing-power-status";

const NOW = new Date("2026-09-10T10:00:00.000Z");

function baseInput() {
  return { id: "power-1", organizationId: "org-1", tenderId: "tender-1", holderName: "Jean Dupont", representedEntityDescription: "Entreprise A", scope: "Signature de l'acte d'engagement", createdBy: "user-1", occurredAt: NOW };
}

describe("SigningPower — mission §17 'preuve documentaire toujours exigée'", () => {
  it("refuses to verify without an attached proof document", () => {
    const power = SigningPower.create(baseInput());
    expect(() => power.verify({ verifiedBy: "user-2", occurredAt: NOW })).toThrow();
  });

  it("verifies once a document is attached", () => {
    const power = SigningPower.create(baseInput());
    power.linkDocument({ administrativeDocumentId: "doc-1", occurredAt: NOW });
    power.verify({ verifiedBy: "user-2", occurredAt: NOW });
    expect(power.verifiedBy).toBe("user-2");
  });

  it("update() clears any prior verification — a modified power is never left verified on its old content", () => {
    const power = SigningPower.create(baseInput());
    power.linkDocument({ administrativeDocumentId: "doc-1", occurredAt: NOW });
    power.verify({ verifiedBy: "user-2", occurredAt: NOW });
    power.update({ scope: "Nouveau périmètre", occurredAt: NOW });
    expect(power.verifiedAt).toBeUndefined();
  });
});

describe("deriveSigningPowerStatus", () => {
  it("returns UNVERIFIED when never verified, regardless of an attached file", () => {
    expect(deriveSigningPowerStatus({ now: NOW })).toBe(SigningPowerStatus.Unverified);
  });

  it("returns VALID when verified and not expired", () => {
    expect(deriveSigningPowerStatus({ verifiedAt: NOW, now: NOW })).toBe(SigningPowerStatus.Valid);
  });

  it("returns EXPIRED when verified but past the expiry date", () => {
    expect(deriveSigningPowerStatus({ verifiedAt: NOW, expiresAt: new Date("2026-01-01"), now: NOW })).toBe(SigningPowerStatus.Expired);
  });
});
