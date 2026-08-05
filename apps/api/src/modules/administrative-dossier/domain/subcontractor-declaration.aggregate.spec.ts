import { describe, expect, it } from "vitest";
import { SubcontractorDeclaration } from "./subcontractor-declaration.aggregate";
import { InvalidSubcontractorAmountError } from "./errors";

const NOW = new Date("2026-09-10T10:00:00.000Z");

function baseInput(overrides: Partial<Parameters<typeof SubcontractorDeclaration.create>[0]> = {}) {
  return {
    id: "sub-1",
    organizationId: "org-1",
    tenderId: "tender-1",
    subcontractorName: "Sous-traitant SARL",
    servicesDescription: "Travaux de plomberie",
    amountValue: 10000,
    amountCurrency: "EUR",
    createdBy: "user-1",
    occurredAt: NOW,
    ...overrides,
  };
}

describe("SubcontractorDeclaration (DC4) — mission §12", () => {
  it("creates a declaration with a non-negative amount", () => {
    const declaration = SubcontractorDeclaration.create(baseInput());
    expect(declaration.amountValue).toBe(10000);
  });

  it("refuses a negative amount at creation", () => {
    expect(() => SubcontractorDeclaration.create(baseInput({ amountValue: -1 }))).toThrow(InvalidSubcontractorAmountError);
  });

  it("refuses a percentage outside 0-100", () => {
    expect(() => SubcontractorDeclaration.create(baseInput({ percentageOfTotal: 150 }))).toThrow(InvalidSubcontractorAmountError);
  });

  it("refuses a negative amount on update() too", () => {
    const declaration = SubcontractorDeclaration.create(baseInput());
    expect(() => declaration.update({ amountValue: -5, occurredAt: NOW })).toThrow(InvalidSubcontractorAmountError);
  });

  it("multiple declarations can coexist for the same tender — no uniqueness constraint at the domain level", () => {
    const first = SubcontractorDeclaration.create(baseInput({ id: "sub-1" }));
    const second = SubcontractorDeclaration.create(baseInput({ id: "sub-2", subcontractorName: "Autre sous-traitant" }));
    expect(first.id).not.toBe(second.id);
    expect(first.tenderId).toBe(second.tenderId);
  });
});
