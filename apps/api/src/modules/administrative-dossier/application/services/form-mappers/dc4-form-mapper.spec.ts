import { describe, expect, it } from "vitest";
import { mapDc4Form } from "./dc4-form-mapper";
import { SubcontractorDeclaration } from "../../../domain/subcontractor-declaration.aggregate";
import { FormFieldSource } from "../../../domain/form-field-source";

const NOW = new Date("2026-09-10T10:00:00.000Z");
const ORGANIZATION_ID = "org-1";
const TENDER_ID = "tender-1";

function makeDeclaration(overrides: Partial<Parameters<typeof SubcontractorDeclaration.create>[0]> = {}) {
  return SubcontractorDeclaration.create({
    id: "sub-1",
    organizationId: ORGANIZATION_ID,
    tenderId: TENDER_ID,
    subcontractorName: "Sous-traitant A",
    servicesDescription: "Travaux de terrassement",
    amountValue: 12345.6,
    amountCurrency: "EUR",
    createdBy: "user-1",
    occurredAt: NOW,
    ...overrides,
  });
}

describe("mapDc4Form", () => {
  it("is deterministic — same input produces the same values/renderable", () => {
    const declaration = makeDeclaration();
    const first = mapDc4Form({ declaration, tenderTitle: "Marché de test" });
    const second = mapDc4Form({ declaration, tenderTitle: "Marché de test" });
    expect(first.values).toEqual(second.values);
    expect(first.renderable).toEqual(second.renderable);
  });

  it("never invents a value for an absent optional field — marks it (non renseigné) and warns without blocking", () => {
    const declaration = makeDeclaration();
    const result = mapDc4Form({ declaration, tenderTitle: "Marché de test" });

    expect(result.values.subcontractorLegalIdentifier).toBeUndefined();
    expect(result.missingFields).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.every((w) => !w.blocking)).toBe(true);
    expect(result.warnings.some((w) => w.fieldPath === "subcontractorLegalIdentifier")).toBe(true);
  });

  it("sources every field from the declaration by default", () => {
    const declaration = makeDeclaration();
    const result = mapDc4Form({ declaration, tenderTitle: "Marché de test" });

    expect(result.fieldSources.subcontractorName).toBe(FormFieldSource.Subcontractor);
    expect(result.fieldSources.servicesDescription).toBe(FormFieldSource.Subcontractor);
    expect(result.values.subcontractorName).toBe("Sous-traitant A");
  });

  it("an override replaces the displayed value and is marked USER_INPUT, without touching the declaration itself", () => {
    const declaration = makeDeclaration();
    const result = mapDc4Form({ declaration, tenderTitle: "Marché de test", overrides: { paymentTerms: "Paiement à 30 jours net" } });

    expect(result.values.paymentTerms).toBe("Paiement à 30 jours net");
    expect(result.fieldSources.paymentTerms).toBe(FormFieldSource.UserInput);
    expect(declaration.paymentTerms).toBeUndefined();
  });

  it("includes the annex disclaimer notice and never omits the official-form reference", () => {
    const declaration = makeDeclaration();
    const result = mapDc4Form({ declaration, tenderTitle: "Marché de test" });

    const noticeBlock = result.renderable.sections[0]?.blocks.find((b) => b.kind === "notice");
    expect(noticeBlock).toBeDefined();
    expect(noticeBlock && "text" in noticeBlock ? noticeBlock.text : "").toContain("ne remplace pas le formulaire officiel");
  });
});
