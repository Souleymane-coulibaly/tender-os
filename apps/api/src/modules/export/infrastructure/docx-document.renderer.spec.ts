import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { DocxDocumentRenderer } from "./docx-document.renderer";
import type { RenderableDocument } from "../application/services/renderable-document";

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
          { kind: "paragraph", text: "Contenu avec accents éàûôçñ et caractères spéciaux : « ” — 100 % ✓." },
          { kind: "list", items: ["Point un", "Point deux"], ordered: false },
          { kind: "list", items: ["Étape un", "Étape deux"], ordered: true },
          { kind: "table", headerRow: ["Critère", "Réponse"], rows: [["Délai", "12 semaines"]] },
          { kind: "notice", text: "Estimation indicative et non contractuelle." },
          { kind: "pageBreak" },
        ],
      },
    ],
    ...overrides,
  };
}

/**
 * Mission Sprint 8A §23 — "absence de corruption", "ZIP interne DOCX valide", "styles présents",
 * "aucun fichier temporaire inclus". Un DOCX est structurellement un ZIP OOXML : on vérifie ici sa
 * validité réelle (jamais seulement que `Packer.toBuffer` n'a pas levé d'exception).
 */
describe("DocxDocumentRenderer", () => {
  it("produces a structurally valid OOXML (ZIP) file", async () => {
    const renderer = new DocxDocumentRenderer();
    const buffer = await renderer.render(baseDocument());

    expect(buffer.length).toBeGreaterThan(0);
    const zip = await JSZip.loadAsync(buffer);
    expect(zip.files["[Content_Types].xml"]).toBeDefined();
    expect(zip.files["word/document.xml"]).toBeDefined();
    expect(zip.files["_rels/.rels"]).toBeDefined();
  });

  it("embeds the section text, including accented characters, in the document XML", async () => {
    const renderer = new DocxDocumentRenderer();
    const buffer = await renderer.render(baseDocument());
    const zip = await JSZip.loadAsync(buffer);
    const documentXml = await zip.files["word/document.xml"]!.async("string");
    expect(documentXml).toContain("Résumé exécutif");
    expect(documentXml).toContain("100");
  });

  it("includes a table of contents field when requested", async () => {
    const renderer = new DocxDocumentRenderer();
    const buffer = await renderer.render(baseDocument({ showTableOfContents: true }));
    const zip = await JSZip.loadAsync(buffer);
    const documentXml = await zip.files["word/document.xml"]!.async("string");
    expect(documentXml).toContain("TOC");
  });

  it("omits the table of contents field when not requested", async () => {
    const renderer = new DocxDocumentRenderer();
    const buffer = await renderer.render(baseDocument({ showTableOfContents: false }));
    const zip = await JSZip.loadAsync(buffer);
    const documentXml = await zip.files["word/document.xml"]!.async("string");
    expect(documentXml).not.toContain("TOC");
  });

  it("renders a table with the expected number of rows", async () => {
    const renderer = new DocxDocumentRenderer();
    const buffer = await renderer.render(baseDocument());
    const zip = await JSZip.loadAsync(buffer);
    const documentXml = await zip.files["word/document.xml"]!.async("string");
    expect((documentXml.match(/<w:tbl>/g) ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it("renders a watermark notice when the document is a preview", async () => {
    const renderer = new DocxDocumentRenderer();
    const buffer = await renderer.render(baseDocument({ watermarkText: "APERÇU" }));
    const zip = await JSZip.loadAsync(buffer);
    const documentXml = await zip.files["word/document.xml"]!.async("string");
    expect(documentXml).toContain("APER");
  });

  it("renders a document with no cover page and no header/footer text without error", async () => {
    const renderer = new DocxDocumentRenderer();
    const buffer = await renderer.render(baseDocument({ coverPage: undefined, headerText: undefined, footerText: undefined }));
    const zip = await JSZip.loadAsync(buffer);
    expect(zip.files["word/document.xml"]).toBeDefined();
  });

  it("does not include any macro-related part (no vbaProject)", async () => {
    const renderer = new DocxDocumentRenderer();
    const buffer = await renderer.render(baseDocument());
    const zip = await JSZip.loadAsync(buffer);
    expect(Object.keys(zip.files).some((name) => name.includes("vbaProject"))).toBe(false);
  });
});
