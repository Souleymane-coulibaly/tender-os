import { Injectable } from "@nestjs/common";
// Import volontairement non typé (voir la docstring ci-dessous, "aucun import de `pdfmake/interfaces`").
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfmake = require("pdfmake");
import type { PdfRendererPort } from "../application/ports/pdf-renderer";
import type { RenderableBlock, RenderableDocument } from "../application/services/renderable-document";
import { UnreliableRenderError } from "../domain/errors";

/**
 * Mission Sprint 8A §13/§15/§24 — rendu PDF via `pdfmake` (construit sur `pdfkit`, pure JS, sans
 * navigateur headless). Sécurité : aucune ressource externe/locale n'est jamais chargée
 * (`setUrlAccessPolicy`/`setLocalAccessPolicy` explicitement deny-all — le contenu vient
 * exclusivement de données déjà validées en base, jamais d'une URL fournie par un acteur).
 *
 * Import volontairement NON typé (`require`, jamais `import ... from "pdfmake/interfaces"`) :
 * `@types/pdfmake` déclare `/// <reference lib="dom" />` dans `interfaces.d.ts`, ce qui charge
 * `lib.dom.d.ts` pour TOUT le programme TypeScript (portée globale, pas seulement ce fichier) et
 * casse la compilation de fichiers de test Sprint 2/3/4 totalement indépendants (`Buffer` vs
 * `BlobPart`) — vérifié empiriquement en isolant chaque import un par un. Un type local minimal
 * (`PdfDocDefinition` ci-dessous) remplace le typage officiel pour ce seul fichier ; la fiabilité
 * réelle du PDF produit est vérifiée par les tests d'intégrité ci-dessous et par
 * `pdfmake-document.renderer.spec.ts` (structure PDF réelle, jamais seulement le typage).
 *
 * Limite assumée et documentée (rapport §H) : PAS de table des matières dynamique avec numéros de
 * page (pdfmake 0.3.x ne fournit pas cette capacité de façon suffisamment fiable pour être
 * déclarée ici) — un simple sommaire (titres de section, sans pagination) est rendu à la place.
 * Ne prétend PAS produire du PDF/A.
 */
type PdfContent = Record<string, unknown> | string;

type PdfDocDefinition = {
  content: PdfContent[];
  styles: Record<string, Record<string, unknown>>;
  defaultStyle: Record<string, unknown>;
  pageMargins: readonly [number, number, number, number];
  footer: (currentPage: number, pageCount: number) => PdfContent;
  header?: PdfContent | undefined;
};

const STANDARD_FONTS = {
  Helvetica: { normal: "Helvetica", bold: "Helvetica-Bold", italics: "Helvetica-Oblique", bolditalics: "Helvetica-BoldOblique" },
};

/** Les 14 polices standard PDF ne sont PAS des fichiers sur disque, mais pdfmake fait tout de même
 *  transiter leur nom par la politique d'accès local — seuls ces noms précis sont autorisés,
 *  n'importe quel autre chemin (en particulier tout chemin qui proviendrait, même indirectement,
 *  d'une donnée utilisateur) est refusé (mission §71 "aucun chemin arbitraire"). */
const ALLOWED_LOCAL_FONT_NAMES = new Set(Object.values(STANDARD_FONTS).flatMap((variants) => Object.values(variants)));

@Injectable()
export class PdfmakeDocumentRenderer implements PdfRendererPort {
  constructor() {
    pdfmake.setFonts(STANDARD_FONTS);
    pdfmake.setUrlAccessPolicy(() => false);
    pdfmake.setLocalAccessPolicy((path: string) => ALLOWED_LOCAL_FONT_NAMES.has(path));
  }

  async render(document: RenderableDocument): Promise<Buffer> {
    const content: PdfContent[] = [];

    if (document.watermarkText) {
      content.push({ text: document.watermarkText, style: "watermark", alignment: "center" });
    }

    if (document.coverPage) {
      const cover = document.coverPage;
      if (cover.showTitle) content.push({ text: document.documentTitle, style: "title" });
      if (cover.showBuyerName && cover.buyerName) content.push({ text: `Acheteur : ${cover.buyerName}` });
      if (cover.showClientName && cover.clientName) content.push({ text: `Client : ${cover.clientName}` });
      if (cover.showReference && cover.reference) content.push({ text: `Référence du marché : ${cover.reference}` });
      if (cover.tenderTitle) content.push({ text: cover.tenderTitle });
      if (cover.showDate) content.push({ text: `Date : ${cover.date}` });
      if (cover.showVersion) content.push({ text: `Version : ${cover.version}`, pageBreak: "after" });
    }

    if (document.showTableOfContents && document.sections.length > 0) {
      content.push({ text: "Sommaire", style: "h1" });
      content.push({ ul: document.sections.map((section) => section.label) });
      content.push({ text: "", pageBreak: "after" });
    }

    for (const section of document.sections) {
      for (const block of section.blocks) {
        content.push(...renderBlock(block));
      }
    }

    const docDefinition: PdfDocDefinition = {
      content,
      styles: {
        title: { fontSize: 22, bold: true, margin: [0, 0, 0, 12] },
        h1: { fontSize: 16, bold: true, margin: [0, 12, 0, 6] },
        h2: { fontSize: 13, bold: true, margin: [0, 10, 0, 5] },
        h3: { fontSize: 11, bold: true, margin: [0, 8, 0, 4] },
        notice: { italics: true, color: "#666666" },
        watermark: { fontSize: 40, bold: true, color: "#C00000" },
      },
      defaultStyle: { font: "Helvetica", fontSize: 10 },
      pageMargins: [50, 50, 50, 60],
      footer: (currentPage: number, pageCount: number) => ({
        columns: [
          { text: document.footerText ?? "", alignment: "left", margin: [50, 0, 0, 0], fontSize: 8 },
          ...(document.showPageNumbers ? [{ text: `Page ${currentPage} / ${pageCount}`, alignment: "right", margin: [0, 0, 50, 0], fontSize: 8 }] : []),
        ],
      }),
      header: document.headerText ? { text: document.headerText, alignment: "center", margin: [0, 20, 0, 0], fontSize: 8 } : undefined,
    };

    const pdfDoc = pdfmake.createPdf(docDefinition);
    const buffer: Buffer = await pdfDoc.getBuffer();

    if (buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
      throw new UnreliableRenderError("the produced file does not start with a valid %PDF- header");
    }
    if (!buffer.subarray(-1024).toString("latin1").includes("%%EOF")) {
      throw new UnreliableRenderError("the produced file is missing its %%EOF trailer");
    }

    return buffer;
  }
}

function headingStyle(level: 1 | 2 | 3): string {
  return level === 1 ? "h1" : level === 2 ? "h2" : "h3";
}

function renderBlock(block: RenderableBlock): PdfContent[] {
  switch (block.kind) {
    case "heading":
      return [{ text: block.text, style: headingStyle(block.level) }];
    case "paragraph":
      return [{ text: block.text, margin: [0, 0, 0, 6] }];
    case "list":
      return [block.ordered ? { ol: [...block.items] } : { ul: [...block.items] }];
    case "table":
      return [
        {
          table: {
            headerRows: block.headerRow ? 1 : 0,
            widths: (block.headerRow ?? block.rows[0] ?? []).map(() => "*"),
            body: [...(block.headerRow ? [block.headerRow.map((cell) => ({ text: cell, bold: true }))] : []), ...block.rows.map((row) => [...row])],
          },
          margin: [0, 4, 0, 10],
        },
      ];
    case "pageBreak":
      return [{ text: "", pageBreak: "after" }];
    case "notice":
      return [{ text: block.text, style: "notice", margin: [0, 4, 0, 4] }];
    default:
      return [];
  }
}
