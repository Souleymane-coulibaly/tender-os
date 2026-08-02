import { describe, expect, it } from "vitest";
import { assembleExportDocument } from "./export-assembly.service";
import { validateExportTemplateConfig } from "../../domain/export-template-config";
import { ExportSectionSelection, ExportSectionValidationStatus } from "../../domain/export-section-selection";
import { ExportSectionSource } from "../../domain/export-section-source";

const NOW = new Date("2026-09-01T10:00:00.000Z");

function config() {
  return validateExportTemplateConfig({
    sections: [
      { id: "SUMMARY", label: "Résumé", mandatory: true, order: 0 },
      { id: "APPROACH", label: "Approche", mandatory: false, order: 1 },
    ],
  });
}

function section(id: string, order: number, overrides: Partial<Parameters<typeof ExportSectionSelection.create>[0]> = {}) {
  return ExportSectionSelection.create({
    sectionId: id,
    sourceType: ExportSectionSource.Generation,
    generationId: "gen-1",
    validationStatus: ExportSectionValidationStatus.Validated,
    selectedBy: "user-1",
    selectedAt: NOW,
    order,
    ...overrides,
  });
}

describe("assembleExportDocument", () => {
  it("orders sections by selection order, not by template order", () => {
    const doc = assembleExportDocument({
      documentTitle: "Mémoire",
      config: config(),
      sections: [section("APPROACH", 0), section("SUMMARY", 1)],
      resolvedContent: new Map([
        ["APPROACH", { text: "Notre approche." }],
        ["SUMMARY", { text: "Résumé exécutif." }],
      ]),
      version: 1,
      date: NOW,
      isPreview: false,
    });
    expect(doc.sections.map((s) => s.id)).toEqual(["APPROACH", "SUMMARY"]);
  });

  it("appends a mandatory template section as a flagged notice when it was never selected", () => {
    const doc = assembleExportDocument({
      documentTitle: "Mémoire",
      config: config(),
      sections: [section("APPROACH", 0)],
      resolvedContent: new Map([["APPROACH", { text: "Notre approche." }]]),
      version: 1,
      date: NOW,
      isPreview: false,
    });
    const summary = doc.sections.find((s) => s.id === "SUMMARY");
    expect(summary).toBeDefined();
    expect(summary?.blocks.some((b) => b.kind === "notice" && b.text.includes("obligatoire"))).toBe(true);
  });

  it("flags a selected section with unresolved content as missing, never silently omitted", () => {
    const doc = assembleExportDocument({
      documentTitle: "Mémoire",
      config: config(),
      sections: [section("SUMMARY", 0)],
      resolvedContent: new Map(),
      version: 1,
      date: NOW,
      isPreview: false,
    });
    const summary = doc.sections.find((s) => s.id === "SUMMARY");
    expect(summary?.blocks.some((b) => b.kind === "notice" && b.text.includes("manquant"))).toBe(true);
  });

  it("splits generated content into separate paragraphs on double line breaks", () => {
    const doc = assembleExportDocument({
      documentTitle: "Mémoire",
      config: config(),
      sections: [section("SUMMARY", 0)],
      resolvedContent: new Map([["SUMMARY", { text: "Paragraphe un.\n\nParagraphe deux." }]]),
      version: 1,
      date: NOW,
      isPreview: false,
    });
    const paragraphs = doc.sections[0]!.blocks.filter((b) => b.kind === "paragraph");
    expect(paragraphs).toHaveLength(2);
  });

  it("includes a table and a notice for a PRICING section (cost report)", () => {
    const doc = assembleExportDocument({
      documentTitle: "Rapport financier",
      config: validateExportTemplateConfig({ sections: [{ id: "COSTS", label: "Coûts", mandatory: true, order: 0 }] }),
      sections: [section("COSTS", 0, { sourceType: ExportSectionSource.Pricing, generationId: undefined, pricingEstimateId: "estimate-1", pricingEstimateVersionNumber: 1 })],
      resolvedContent: new Map([
        [
          "COSTS",
          {
            table: { headerRow: ["Poste", "Montant"], rows: [["Temps de préparation", "500 EUR"]] },
            notice: "Estimation indicative et non contractuelle.",
          },
        ],
      ]),
      version: 1,
      date: NOW,
      isPreview: false,
    });
    const blocks = doc.sections[0]!.blocks;
    expect(blocks.some((b) => b.kind === "table")).toBe(true);
    expect(blocks.some((b) => b.kind === "notice" && b.text.includes("indicative"))).toBe(true);
  });

  it("sets the APERÇU watermark for a preview", () => {
    const previewDoc = assembleExportDocument({
      documentTitle: "Mémoire",
      config: config(),
      sections: [section("SUMMARY", 0)],
      resolvedContent: new Map([["SUMMARY", { text: "x" }]]),
      version: 1,
      date: NOW,
      isPreview: true,
    });
    expect(previewDoc.watermarkText).toBe("APERÇU");
  });

  it("never sets a watermark for a final export", () => {
    const doc = assembleExportDocument({
      documentTitle: "Mémoire",
      config: config(),
      sections: [section("SUMMARY", 0)],
      resolvedContent: new Map([["SUMMARY", { text: "x" }]]),
      version: 1,
      date: NOW,
      isPreview: false,
    });
    expect(doc.watermarkText).toBeUndefined();
  });
});
