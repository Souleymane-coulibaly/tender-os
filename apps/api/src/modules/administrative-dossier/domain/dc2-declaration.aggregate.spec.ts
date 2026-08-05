import { describe, expect, it } from "vitest";
import { Dc2Declaration } from "./dc2-declaration.aggregate";
import { Dc2DeclarationVersion } from "./dc2-declaration-version.entity";

const NOW = new Date("2026-09-10T10:00:00.000Z");

describe("Dc2Declaration + Dc2DeclarationVersion — mission §11 reproductibilité", () => {
  it("starts at version 0 (no version yet)", () => {
    const dc2 = Dc2Declaration.create({ id: "dc2-1", organizationId: "org-1", tenderId: "tender-1", createdBy: "user-1", occurredAt: NOW });
    expect(dc2.currentVersionNumber).toBe(0);
  });

  it("recordNewVersion advances the pointer", () => {
    const dc2 = Dc2Declaration.create({ id: "dc2-1", organizationId: "org-1", tenderId: "tender-1", createdBy: "user-1", occurredAt: NOW });
    dc2.recordNewVersion({ versionNumber: 1, occurredAt: NOW });
    expect(dc2.currentVersionNumber).toBe(1);
  });

  it("a version snapshot is created with the data frozen at creation time", () => {
    const version = Dc2DeclarationVersion.create({
      id: "dc2v-1",
      organizationId: "org-1",
      dc2DeclarationId: "dc2-1",
      version: 1,
      data: { legalIdentity: "SIRET 123", revenueByYear: [{ year: 2025, amountValue: 100000, amountCurrency: "EUR" }] },
      createdBy: "user-1",
      occurredAt: NOW,
    });
    expect(version.data.legalIdentity).toBe("SIRET 123");
    expect(version.data.revenueByYear?.[0]?.amountValue).toBe(100000);
  });

  it("refuses a negative revenue amount", () => {
    expect(() =>
      Dc2DeclarationVersion.create({
        id: "dc2v-1",
        organizationId: "org-1",
        dc2DeclarationId: "dc2-1",
        version: 1,
        data: { revenueByYear: [{ year: 2025, amountValue: -1, amountCurrency: "EUR" }] },
        createdBy: "user-1",
        occurredAt: NOW,
      }),
    ).toThrow();
  });
});
