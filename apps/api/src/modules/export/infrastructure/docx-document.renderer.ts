import { Injectable } from "@nestjs/common";
import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { DocumentRendererPort } from "../application/ports/document-renderer";
import type { RenderableBlock, RenderableDocument, RenderableTheme, RichTextRun } from "../application/services/renderable-document";

const HEADING_LEVELS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3] as const;

/** `DocumentThemeVersion.accentColor` est validé en amont (domaine Deliverables) au format
 *  `#RRGGBB` — `docx` attend le même hexadécimal SANS le `#`. */
function stripHash(color: string): string {
  return color.replace(/^#/, "").toUpperCase();
}

const IMAGE_TYPE_BY_MIME: Record<string, "png" | "jpg" | "gif" | "bmp"> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/bmp": "bmp",
};

/**
 * Mission Sprint 8A §20/§23 — construit le document via l'API structurée de `docx` (jamais un
 * template XML assemblé à la main : élimine par construction l'injection XML). La table des
 * matières est un champ Word natif (`TableOfContents`) — actualisée par Word à l'ouverture,
 * comportement standard, jamais une liste statique pré-calculée (mission "table des matières
 * actualisable").
 */
@Injectable()
export class DocxDocumentRenderer implements DocumentRendererPort {
  async render(document: RenderableDocument): Promise<Buffer> {
    const children: (Paragraph | Table)[] = [];

    if (document.watermarkText) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: document.watermarkText, bold: true, color: "C00000", size: 56 })],
        }),
      );
    }

    if (document.theme?.logo) {
      const imageType = IMAGE_TYPE_BY_MIME[document.theme.logo.mimeType];
      if (imageType) {
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new ImageRun({ type: imageType, data: document.theme.logo.buffer, transformation: { width: 160, height: 80 } })],
          }),
        );
      }
    }

    if (document.coverPage) {
      const cover = document.coverPage;
      if (cover.showTitle) children.push(new Paragraph({ text: document.documentTitle, heading: HeadingLevel.TITLE }));
      if (cover.showBuyerName && cover.buyerName) children.push(new Paragraph({ text: `Acheteur : ${cover.buyerName}` }));
      if (cover.showClientName && cover.clientName) children.push(new Paragraph({ text: `Client : ${cover.clientName}` }));
      if (cover.showReference && cover.reference) children.push(new Paragraph({ text: `Référence du marché : ${cover.reference}` }));
      if (cover.tenderTitle) children.push(new Paragraph({ text: cover.tenderTitle }));
      if (cover.showDate) children.push(new Paragraph({ text: `Date : ${cover.date}` }));
      if (cover.showVersion) children.push(new Paragraph({ text: `Version : ${cover.version}` }));
      children.push(new Paragraph({ children: [new PageBreak()] }));
    }

    if (document.showTableOfContents) {
      children.push(new Paragraph({ text: "Table des matières", heading: HeadingLevel.HEADING_1 }));
      children.push(
        new TableOfContents("Table des matières", {
          hyperlink: true,
          headingStyleRange: "1-3",
        }),
      );
      children.push(new Paragraph({ children: [new PageBreak()] }));
    }

    for (const section of document.sections) {
      for (const block of section.blocks) {
        children.push(...renderBlock(block, document.theme));
      }
    }

    const fontFamily = document.theme?.fontFamily;

    const doc = new Document({
      // Mission Sprint 8A.2 (correction bugs #7/#8) — police par défaut du document entier quand
      // le thème en fournit une (`fontFamily`, simple référence de nom résolue par Word/LibreOffice
      // à l'ouverture, jamais un fichier de police embarqué côté serveur) ; sinon comportement
      // Sprint 8A inchangé (police par défaut de `docx`).
      ...(fontFamily ? { styles: { default: { document: { run: { font: fontFamily } } } } } : {}),
      numbering: {
        config: [
          {
            reference: "export-numbered-list",
            levels: [{ level: 0, format: "decimal", text: "%1.", alignment: AlignmentType.START }],
          },
        ],
      },
      sections: [
        {
          ...(document.headerText ? { headers: { default: new Header({ children: [new Paragraph(document.headerText)] }) } } : {}),
          footers: {
            default: new Footer({
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    ...(document.footerText ? [new TextRun(`${document.footerText} — `)] : []),
                    ...(document.showPageNumbers
                      ? [new TextRun("Page "), new TextRun({ children: [PageNumber.CURRENT] }), new TextRun(" / "), new TextRun({ children: [PageNumber.TOTAL_PAGES] })]
                      : []),
                  ],
                }),
              ],
            }),
          },
          children,
        },
      ],
    });

    return Packer.toBuffer(doc);
  }
}

function renderBlock(block: RenderableBlock, theme?: RenderableTheme): (Paragraph | Table)[] {
  switch (block.kind) {
    case "heading": {
      const level = HEADING_LEVELS[Math.min(block.level, 3) - 1] ?? HeadingLevel.HEADING_1;
      // Mission Sprint 8A.2 (correction bugs #7/#8) — la couleur d'accent du thème s'applique en
      // formatage direct sur le run (l'emporte sur la couleur du style de titre Word), jamais un
      // second système de styles parallèle.
      if (theme?.accentColor) {
        return [new Paragraph({ heading: level, children: [new TextRun({ text: block.text, color: stripHash(theme.accentColor) })] })];
      }
      return [new Paragraph({ text: block.text, heading: level })];
    }
    case "paragraph":
      return [block.runs && block.runs.length > 0 ? new Paragraph({ children: buildRuns(block.runs) }) : new Paragraph({ text: block.text })];
    case "list":
      return block.items.map((item, index) => {
        const runs = block.itemRuns?.[index];
        const layout = block.ordered ? { numbering: { reference: "export-numbered-list", level: 0 } } : { bullet: { level: 0 } };
        return runs && runs.length > 0 ? new Paragraph({ children: buildRuns(runs), ...layout }) : new Paragraph({ text: item, ...layout });
      });
    case "table": {
      const rows: TableRow[] = [];
      if (block.headerRow) {
        rows.push(
          new TableRow({
            children: block.headerRow.map((cell) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: cell, bold: true })] })] })),
          }),
        );
      }
      for (const row of block.rows) {
        rows.push(new TableRow({ children: row.map((cell) => new TableCell({ children: [new Paragraph(cell)] })) }));
      }
      return [new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows })];
    }
    case "pageBreak":
      return [new Paragraph({ children: [new PageBreak()] })];
    case "notice":
      return [new Paragraph({ children: [new TextRun({ text: block.text, italics: true, color: "808080" })] })];
    default:
      return [];
  }
}

/** Mission Sprint 8A.1 §9 — un `href` déjà validé (`http(s)://` uniquement) par le domaine
 *  Deliverables devient un `ExternalHyperlink` réel ; jamais une navigation locale/relative. */
function buildRuns(runs: readonly RichTextRun[]): (TextRun | ExternalHyperlink)[] {
  return runs.map((run) => {
    const textRun = new TextRun({
      text: run.text,
      ...(run.bold ? { bold: true } : {}),
      ...(run.italic ? { italics: true } : {}),
      ...(run.href ? { style: "Hyperlink" } : {}),
    });
    return run.href ? new ExternalHyperlink({ link: run.href, children: [textRun] }) : textRun;
  });
}
