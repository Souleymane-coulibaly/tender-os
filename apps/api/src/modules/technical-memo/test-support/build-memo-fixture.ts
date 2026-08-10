/**
 * V2 Sprint 12 — construit un DOCX représentatif d'un modèle client de mémoire technique (mission
 * §89 "logo, header/footer, headings, tables, styles, zones vides, instructions"), utilisé par les
 * tests réels (analyse structurelle, préservation de structure, génération finale). Aucun DOCX réel
 * n'a été fourni pour ce sprint (contrairement aux formulaires DC1/DC2/DC4 officiels, Sprint 11) —
 * un modèle d'entreprise générique n'a pas d'équivalent "officiel" universel à respecter, une
 * fixture construite avec la bibliothèque `docx` (déjà utilisée par le module Export) est
 * l'approche établie de ce dépôt (`docx-fixture-builder.ts`, module `extraction`).
 */
import { AlignmentType, Document, Footer, Header, HeadingLevel, ImageRun, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";

const ONE_BY_ONE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

export async function buildMemoTemplateFixture(): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        headers: { default: new Header({ children: [new Paragraph({ children: [new ImageRun({ data: ONE_BY_ONE_PNG, transformation: { width: 20, height: 20 }, type: "png" }), new TextRun({ text: "  Entreprise Exemple SAS" })] })] }) },
        footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Confidentiel — Entreprise Exemple SAS" })] })] }) },
        children: [
          new Paragraph({ text: "Mémoire technique", heading: HeadingLevel.TITLE }),
          new Paragraph({ text: "1. Présentation de l'entreprise", heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ children: [new TextRun({ text: "(Présentez votre entreprise en une page maximum.)", italics: true })] }),
          new Paragraph({ text: "2. Compréhension du besoin", heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: "2.1 Contexte", heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: "" }),
          new Paragraph({ text: "2.2 Enjeux", heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: "" }),
          new Paragraph({ text: "3. Méthodologie", heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ children: [new TextRun({ text: "(Décrivez votre méthodologie en 2 pages maximum.)", italics: true })] }),
          new Paragraph({ text: "4. Moyens humains", heading: HeadingLevel.HEADING_1 }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({ children: [new TableCell({ children: [new Paragraph({ text: "Profil" })] }), new TableCell({ children: [new Paragraph({ text: "Effectif" })] })] }),
              new TableRow({ children: [new TableCell({ children: [new Paragraph({ text: "" })] }), new TableCell({ children: [new Paragraph({ text: "" })] })] }),
            ],
          }),
          new Paragraph({ text: "5. Références", heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: "" }),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}
