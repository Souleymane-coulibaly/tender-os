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

  // Mission Sprint 8A.1 §9 — extension additive de l'IR (runs gras/italique/lien) pour l'éditeur du
  // Mémoire technique : preuve que le renderer DOCX du Sprint 8A honore ces runs sans régression sur
  // le chemin `text` seul déjà couvert ci-dessus.
  it("renders bold and italic runs as real OOXML formatting properties", async () => {
    const renderer = new DocxDocumentRenderer();
    const buffer = await renderer.render(
      baseDocument({
        sections: [
          {
            id: "S1",
            label: "S1",
            blocks: [
              {
                kind: "paragraph",
                text: "Fallback texte brut",
                runs: [{ text: "Texte en gras" as const, bold: true }, { text: " et en italique", italic: true }],
              },
            ],
          },
        ],
      }),
    );
    const zip = await JSZip.loadAsync(buffer);
    const documentXml = await zip.files["word/document.xml"]!.async("string");
    expect(documentXml).toContain("Texte en gras");
    expect(documentXml).toMatch(/<w:b\/>|<w:b\s/);
    expect(documentXml).toMatch(/<w:i\/>|<w:i\s/);
  });

  it("renders a run with an href as a real external hyperlink relationship", async () => {
    const renderer = new DocxDocumentRenderer();
    const buffer = await renderer.render(
      baseDocument({
        sections: [
          {
            id: "S1",
            label: "S1",
            blocks: [{ kind: "paragraph", text: "fallback", runs: [{ text: "voir la référence", href: "https://example.org/preuve" }] }],
          },
        ],
      }),
    );
    const zip = await JSZip.loadAsync(buffer);
    const documentXml = await zip.files["word/document.xml"]!.async("string");
    const relsXml = await zip.files["word/_rels/document.xml.rels"]!.async("string");
    expect(documentXml).toContain("voir la référence");
    expect(documentXml).toContain("<w:hyperlink");
    expect(relsXml).toContain("https://example.org/preuve");
  });

  it("renders list items with runs, falling back to plain text when itemRuns is absent for an item", async () => {
    const renderer = new DocxDocumentRenderer();
    const buffer = await renderer.render(
      baseDocument({
        sections: [
          {
            id: "S1",
            label: "S1",
            blocks: [
              {
                kind: "list",
                ordered: false,
                items: ["Item avec mise en forme", "Item simple"],
                itemRuns: [[{ text: "Item avec mise en forme", bold: true }]],
              },
            ],
          },
        ],
      }),
    );
    const zip = await JSZip.loadAsync(buffer);
    const documentXml = await zip.files["word/document.xml"]!.async("string");
    expect(documentXml).toContain("Item avec mise en forme");
    expect(documentXml).toContain("Item simple");
  });
});
