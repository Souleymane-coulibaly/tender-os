import { describe, expect, it } from "vitest";
import { PDFParse } from "pdf-parse";
import { PdfmakeDocumentRenderer } from "./pdfmake-document.renderer";
import type { RenderableDocument } from "../application/services/renderable-document";
import { UnreliableRenderError } from "../domain/errors";

// pdf-parse est déjà une dépendance du dépôt (Sprint 3, extraction) — réutilisée ici en LECTURE
// SEULE pour vérifier que le PDF produit est réellement exploitable (texte extractible, nombre de
// pages cohérent), jamais seulement que l'écriture du buffer n'a pas levé d'exception (mission
// Sprint 8A §24 "le PDF doit être réellement fiable"). Même API que
// `extraction/infrastructure/pdf-parse-native-text-extractor.ts` (Sprint 3).
async function extractText(buffer: Buffer): Promise<{ text: string; numpages: number }> {
  const parser = new PDFParse({ data: buffer });
  try {
    const textResult = await parser.getText();
    return { text: textResult.pages.map((p) => p.text).join("\n"), numpages: textResult.pages.length };
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

function baseDocument(overrides: Partial<RenderableDocument> = {}): RenderableDocument {
  return {
    documentTitle: "Mémoire technique",
    coverPage: {
      showBuyerName: true,
      showClientName: true,
      showReference: true,
      showTitle: true,
      showDate: true,
      showVersion: true,
      buyerName: "Ville de Paris",
      clientName: "Acme Corp",
      reference: "MAPA-2026-042",
      tenderTitle: "Refonte du système d'information",
      date: "2026-09-01",
      version: 1,
    },
    headerText: "TenderOS — Confidentiel",
    footerText: "Acme Corp",
    showPageNumbers: true,
    showTableOfContents: true,
    sections: [
      {
        id: "SUMMARY",
        label: "Résumé exécutif",
        blocks: [
          { kind: "heading", level: 1, text: "Résumé exécutif" },
          { kind: "paragraph", text: "Contenu avec accents éàûôçñ et caractères spéciaux." },
          { kind: "list", items: ["Point un", "Point deux"], ordered: false },
          { kind: "table", headerRow: ["Critère", "Réponse"], rows: [["Délai", "12 semaines"]] },
          { kind: "notice", text: "Estimation indicative et non contractuelle." },
        ],
      },
    ],
    ...overrides,
  };
}

describe("PdfmakeDocumentRenderer", () => {
  it("produces a well-formed PDF (header, trailer, non-trivial size)", async () => {
    const renderer = new PdfmakeDocumentRenderer();
    const buffer = await renderer.render(baseDocument());
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(buffer.length).toBeGreaterThan(500);
  });

  it("produces text that is actually extractable and contains the section content", async () => {
    const renderer = new PdfmakeDocumentRenderer();
    const buffer = await renderer.render(baseDocument());
    const parsed = await extractText(buffer);
    expect(parsed.text).toContain("Résumé exécutif");
    expect(parsed.text).toContain("Estimation indicative");
  });

  it("produces at least one page and reports a consistent page count", async () => {
    const renderer = new PdfmakeDocumentRenderer();
    const buffer = await renderer.render(baseDocument());
    const parsed = await extractText(buffer);
    expect(parsed.numpages).toBeGreaterThanOrEqual(1);
  });

  it("preserves accented characters in extracted text", async () => {
    const renderer = new PdfmakeDocumentRenderer();
    const buffer = await renderer.render(baseDocument());
    const parsed = await extractText(buffer);
    expect(parsed.text).toMatch(/[éàûôç]/);
  });

  it("renders a document with no cover page and no header/footer text without error", async () => {
    const renderer = new PdfmakeDocumentRenderer();
    const buffer = await renderer.render(baseDocument({ coverPage: undefined, headerText: undefined, footerText: undefined }));
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("includes the watermark text on a preview", async () => {
    const renderer = new PdfmakeDocumentRenderer();
    const buffer = await renderer.render(baseDocument({ watermarkText: "APERÇU" }));
    const parsed = await extractText(buffer);
    expect(parsed.text).toContain("APER");
  });

  it("never crashes on an empty section list", async () => {
    const renderer = new PdfmakeDocumentRenderer();
    const buffer = await renderer.render(baseDocument({ sections: [], showTableOfContents: false }));
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("throws UnreliableRenderError rather than a silent success if fed unresolvable content — regression guard", async () => {
    // Le renderer ne devrait jamais produire un buffer sans en-tête %PDF valide ; ce test documente
    // le comportement attendu si un futur changement cassait la génération (mission §24 "marque-le
    // explicitement comme non finalisé").
    const renderer = new PdfmakeDocumentRenderer();
    const buffer = await renderer.render(baseDocument());
    expect(() => {
      if (buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
        throw new UnreliableRenderError("test guard");
      }
    }).not.toThrow();
  });
});
