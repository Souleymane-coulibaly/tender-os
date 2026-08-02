import { Injectable } from "@nestjs/common";
import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  Footer,
  Header,
  HeadingLevel,
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
import type { RenderableBlock, RenderableDocument, RichTextRun } from "../application/services/renderable-document";

const HEADING_LEVELS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3] as const;

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
        children.push(...renderBlock(block));
      }
    }

    const doc = new Document({
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

function renderBlock(block: RenderableBlock): (Paragraph | Table)[] {
  switch (block.kind) {
    case "heading": {
      const level = HEADING_LEVELS[Math.min(block.level, 3) - 1] ?? HeadingLevel.HEADING_1;
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
