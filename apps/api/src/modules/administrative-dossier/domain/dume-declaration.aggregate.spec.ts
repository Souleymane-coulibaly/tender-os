import { describe, expect, it } from "vitest";
import { DumeDeclaration } from "./dume-declaration.aggregate";
import { DumeDeclarationVersion } from "./dume-declaration-version.entity";

const NOW = new Date("2026-09-10T10:00:00.000Z");

describe("DumeDeclaration + DumeDeclarationVersion — mission §13 capture structurée", () => {
  it("starts at version 0 (no version yet)", () => {
    const dume = DumeDeclaration.create({ id: "dume-1", organizationId: "org-1", tenderId: "tender-1", createdBy: "user-1", occurredAt: NOW });
    expect(dume.currentVersionNumber).toBe(0);
  });

  it("recordNewVersion advances the pointer", () => {
    const dume = DumeDeclaration.create({ id: "dume-1", organizationId: "org-1", tenderId: "tender-1", createdBy: "user-1", occurredAt: NOW });
    dume.recordNewVersion({ versionNumber: 1, occurredAt: NOW });
    expect(dume.currentVersionNumber).toBe(1);
  });

  it("a version snapshot is created with the data frozen at creation time", () => {
    const version = DumeDeclarationVersion.create({
      id: "dumev-1",
      organizationId: "org-1",
      dumeDeclarationId: "dume-1",
      version: 1,
      data: { legalIdentity: "SIRET 456", revenueByYear: [{ year: 2025, amountValue: 250000, amountCurrency: "EUR" }] },
      createdBy: "user-1",
      occurredAt: NOW,
    });
    expect(version.data.legalIdentity).toBe("SIRET 456");
    expect(version.data.revenueByYear?.[0]?.amountValue).toBe(250000);
  });

  it("refuses a negative revenue amount", () => {
    expect(() =>
      DumeDeclarationVersion.create({
        id: "dumev-1",
        organizationId: "org-1",
        dumeDeclarationId: "dume-1",
        version: 1,
        data: { revenueByYear: [{ year: 2025, amountValue: -1, amountCurrency: "EUR" }] },
        createdBy: "user-1",
        occurredAt: NOW,
      }),
    ).toThrow();
  });
});
