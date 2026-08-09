/**
 * Génère le/les template(s) DOCX de démonstration (mission §"1-2 fichiers DOCX représentatifs") —
 * un fichier RÉEL construit via la bibliothèque `docx` (jamais une XML écrite à la main), couvrant :
 * paragraphe simple, placeholder simple, placeholder fragmenté entre PLUSIEURS runs Word (deux
 * `TextRun` distincts dans le même paragraphe), un tableau à duplication de ligne, une case à
 * cocher, une date, un montant, un texte long, des caractères accentués. Exécuté une fois via
 * `pnpm exec tsx src/modules/document-generation/test-support/generate-demo-template.ts` — le
 * fichier produit est un artefact binaire versionné (fixture de test), jamais régénéré au runtime.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";

async function main(): Promise<void> {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ children: [new TextRun("Modèle de démonstration — Moteur documentaire V2 (Sprint 10)")] }),

          new Paragraph({ children: [new TextRun("Objet du marché : {{tender.reference}}")] }),

          // Placeholder fragmenté entre DEUX runs Word distincts — reproduit exactement le cas
          // classique "Word a scindé le tag pendant une édition" : docxtemplater doit le
          // reconstruire avant résolution, jamais un remplacement de chaîne naïf.
          new Paragraph({
            children: [new TextRun("Titre : "), new TextRun("{{tend"), new TextRun("er.title}}"), new TextRun(" (fin du titre)")],
          }),

          new Paragraph({ children: [new TextRun("Date limite de dépôt : {{tender.deadline}}")] }),
          new Paragraph({ children: [new TextRun("Montant total estimé : {{pricing.totalAmount}}")] }),
          new Paragraph({ children: [new TextRun("Sous-traitance envisagée : {{compliance.subcontracting}}")] }),
          new Paragraph({ children: [new TextRun("Description : {{tender.description}}")] }),

          // Caractères accentués dans le texte STATIQUE et dans un placeholder dont la valeur
          // fournie à la génération contiendra elle aussi des accents.
          new Paragraph({
            children: [
              new TextRun(
                "Candidat : {{candidate.name}} — Réponse déposée à l'attention du pouvoir adjudicateur, conformément à l'article R.2143-3 du Code de la commande publique. Éléments complémentaires : île, çà, être, à côté.",
              ),
            ],
          }),

          new Paragraph({ children: [new TextRun("Détail des prestations :")] }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ children: [new TextRun("Désignation")] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun("Montant")] })] }),
                ],
              }),
              // Ligne de boucle docxtemplater — `{#items}` ouvre au début de la première cellule,
              // `{/items}` ferme à la fin de la dernière cellule de la MÊME ligne : c'est la ligne
              // entière qui se duplique, une fois par élément du tableau fourni à la génération.
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ children: [new TextRun("{{#items}}{{name}}")] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun("{{amount}}{{/items}}")] })] }),
                ],
              }),
            ],
          }),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const outputPath = join(__dirname, "fixtures", "demo-template.docx");
  writeFileSync(outputPath, buffer);
  console.log(`Wrote ${buffer.length} bytes to ${outputPath}`);
}

void main();
