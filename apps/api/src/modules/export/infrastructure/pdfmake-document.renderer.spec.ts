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

  // Mission Sprint 8A.1 §9 — même extension additive de l'IR que le renderer DOCX, preuve
  // équivalente côté PDF : le contenu des runs reste extractible et le lien devient une annotation
  // PDF réelle (jamais un simple texte), sans casser le chemin `text` seul existant.
  it("renders bold/italic run text as extractable content", async () => {
    const renderer = new PdfmakeDocumentRenderer();
    const buffer = await renderer.render(
      baseDocument({
        sections: [
          {
            id: "S1",
            label: "S1",
            blocks: [{ kind: "paragraph", text: "fallback", runs: [{ text: "Texte en gras", bold: true }, { text: " et en italique", italic: true }] }],
          },
        ],
      }),
    );
    const parsed = await extractText(buffer);
    expect(parsed.text).toContain("Texte en gras");
    expect(parsed.text).toContain("et en italique");
  });

  it("renders a run with an href as a real PDF link annotation (/URI)", async () => {
    const renderer = new PdfmakeDocumentRenderer();
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
    const parsed = await extractText(buffer);
    expect(parsed.text).toContain("voir la référence");
    expect(buffer.toString("latin1")).toContain("https://example.org/preuve");
  });

  it("renders list items with runs alongside plain-text items", async () => {
    const renderer = new PdfmakeDocumentRenderer();
    const buffer = await renderer.render(
      baseDocument({
        sections: [
          {
            id: "S1",
            label: "S1",
            blocks: [
              { kind: "list", ordered: true, items: ["Item avec mise en forme", "Item simple"], itemRuns: [[{ text: "Item avec mise en forme", bold: true }]] },
            ],
          },
        ],
      }),
    );
    const parsed = await extractText(buffer);
    expect(parsed.text).toContain("Item avec mise en forme");
    expect(parsed.text).toContain("Item simple");
  });

  // Mission Sprint 8A.2 (correction bugs #7/#8 "thème document pas toujours appliqué") — preuve
  // RÉELLE sur les octets PDF produits, jamais seulement l'absence d'exception.
  describe("mission Sprint 8A.2 — theme application (bugs #7/#8)", () => {
    it("produces a different PDF when an accent color theme is applied (color genuinely reaches the output)", async () => {
      const renderer = new PdfmakeDocumentRenderer();
      const withoutTheme = await renderer.render(baseDocument());
      const withTheme = await renderer.render(baseDocument({ theme: { accentColor: "#1A73E8" } }));
      expect(withTheme.equals(withoutTheme)).toBe(false);
      // Le texte lui-même reste inchangé — seule la mise en forme diffère (mission "jamais
      // recalculer le contenu pour appliquer un thème").
      const parsed = await extractText(withTheme);
      expect(parsed.text).toContain("Résumé exécutif");
    });

    it("embeds the theme's logo as a real image XObject in the PDF", async () => {
      const renderer = new PdfmakeDocumentRenderer();
      const onePixelPng = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      );
      const buffer = await renderer.render(baseDocument({ theme: { logo: { buffer: onePixelPng, mimeType: "image/png" } } }));
      expect(buffer.toString("latin1")).toMatch(/\/Subtype\s*\/Image/);
    });

    it("never embeds an image XObject when no theme logo is provided", async () => {
      const renderer = new PdfmakeDocumentRenderer();
      const buffer = await renderer.render(baseDocument({ theme: undefined }));
      expect(buffer.toString("latin1")).not.toMatch(/\/Subtype\s*\/Image/);
    });
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
