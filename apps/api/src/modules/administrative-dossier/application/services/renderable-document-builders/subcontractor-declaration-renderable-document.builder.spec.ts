import { describe, expect, it } from "vitest";
import { buildSubcontractorDeclarationRenderableDocument } from "./subcontractor-declaration-renderable-document.builder";
import { SubcontractorDeclaration } from "../../../domain/subcontractor-declaration.aggregate";

const NOW = new Date("2026-09-10T10:00:00.000Z");

describe("buildSubcontractorDeclarationRenderableDocument", () => {
  it("renders the subcontractor's name and amount", () => {
    const declaration = SubcontractorDeclaration.create({
      id: "sub-1",
      organizationId: "org-1",
      tenderId: "tender-1",
      subcontractorName: "Sous-traitant A",
      servicesDescription: "Terrassement",
      amountValue: 12345.67,
      amountCurrency: "EUR",
      createdBy: "user-1",
      occurredAt: NOW,
    });

    const document = buildSubcontractorDeclarationRenderableDocument({ declaration, tenderTitle: "Marché de test" });

    const blocks = document.sections[0]!.blocks;
    expect(blocks.some((b) => b.kind === "paragraph" && b.text.includes("Sous-traitant A"))).toBe(true);
    expect(blocks.some((b) => b.kind === "paragraph" && b.text.includes("345,67") && b.text.includes("EUR"))).toBe(true);
  });
});
