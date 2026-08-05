import { describe, expect, it } from "vitest";
import { buildDc2RenderableDocument, buildDumeRenderableDocument } from "./structured-capacity-statement-renderable-document.builder";

describe("buildDc2RenderableDocument", () => {
  it("renders a revenue table when revenueByYear is present", () => {
    const document = buildDc2RenderableDocument({
      data: { legalIdentity: "SIRET 123", revenueByYear: [{ year: 2025, amountValue: 500000, amountCurrency: "EUR" }] },
      version: 1,
      tenderTitle: "Marché de test",
    });

    expect(document.documentTitle).toContain("version 1");
    const capaciteSection = document.sections.find((s) => s.id === "identite")!;
    expect(capaciteSection.blocks.some((b) => b.kind === "table")).toBe(true);
  });

  it("renders a notice instead of a table when no revenue data is present — never a blocked generation", () => {
    const document = buildDc2RenderableDocument({ data: {}, version: 1, tenderTitle: "Marché de test" });

    const identiteSection = document.sections.find((s) => s.id === "identite")!;
    expect(identiteSection.blocks.some((b) => b.kind === "notice")).toBe(true);
    expect(identiteSection.blocks.some((b) => b.kind === "table")).toBe(false);
  });
});

describe("buildDumeRenderableDocument", () => {
  it("includes an explicit non-ESPD-conformity notice", () => {
    const document = buildDumeRenderableDocument({ data: { legalIdentity: "SIRET 456" }, version: 2, tenderTitle: "Marché de test" });

    expect(document.documentTitle).toContain("version 2");
    const marcheSection = document.sections.find((s) => s.id === "marche")!;
    expect(marcheSection.blocks.some((b) => b.kind === "notice" && b.text.includes("ESPD"))).toBe(true);
  });
});
