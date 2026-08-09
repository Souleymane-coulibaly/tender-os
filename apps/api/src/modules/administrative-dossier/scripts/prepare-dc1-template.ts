/**
 * Prépare UNE FOIS la copie dérivée TenderOS du DC1 officiel réel fourni (mission V2 Sprint 11,
 * décision validée §"copie dérivée avec tags insérés"). Le fichier officiel
 * (`dc1-lettre-de-candidature-2019.docx`, DAJ, Licence Ouverte Etalab 2.0) N'EST JAMAIS modifié —
 * ce script le lit, produit un NOUVEAU buffer, et écrit le résultat sous
 * `assets/dc1-template-v1.docx`. Exécuté via
 * `pnpm exec tsx src/modules/administrative-dossier/scripts/prepare-dc1-template.ts`.
 *
 * Chaque insertion référence le texte EXACT du DOCX officiel (vérifié par inspection réelle de
 * `word/document.xml`, jamais depuis une connaissance théorique du formulaire DC1) :
 *
 * - 12 cases à cocher héritées (`w:ffData`/FORMCHECKBOX), dans l'ordre du document :
 *   1. "pour le marché public (en cas de non allotissement)" (rubrique C)
 *   2. "pour tous les lots de la procédure"                   (rubrique C)
 *   3. "pour le lot n°... ou les lots n°..."                  (rubrique C)
 *   4. "Le candidat se présente seul"                          (rubrique D)
 *   5. "Le candidat est un groupement d'entreprises"           (rubrique D)
 *   6. "conjoint" (groupement)                                 (rubrique D)
 *   7. "solidaire" (groupement)                                (rubrique D)
 *   8. "Non" (mandataire solidaire)                            (rubrique D)
 *   9. "Oui" (mandataire solidaire)                            (rubrique D)
 *   10. "cocher la case suivante" (attestation absence exclusion) (rubrique F1)
 *   11. "le formulaire DC2"                                    (rubrique F3)
 *   12. "les documents établissant ses capacités"              (rubrique F3)
 *
 * - Zones vides identifiées par leur index de paragraphe (0-indexé dans l'ordre du document,
 *   confirmé par extraction réelle — voir le paragraphe juste avant chaque index cité) :
 *   P5   (après "A - Identification de l'acheteur")
 *   P14  (après "B - Objet de la consultation")
 *   P35  (après le paragraphe de la case "lot n°...")
 *   P46, P50, P54, P58, P62 (après "Nom commercial...", "Adresses...", "Adresse électronique :",
 *        "Numéros de téléphone...", "Numéro SIRET..." — candidat, rubrique D)
 *   P98, P102 (après "- Adresse internet :", "- Renseignements nécessaires pour y accéder :" —
 *        rubrique F2)
 *   P122, P126, P130, P134, P138 (mêmes 5 champs que le candidat, pour le mandataire, rubrique G)
 *
 * - Table 8 (rubrique E, "Identification des membres du groupement") : ligne de donnée 1
 *   transformée en boucle docxtemplater `{{#members}}...{{/members}}`, lignes 2-4 (identiques,
 *   statiques) supprimées — la boucle duplique dynamiquement autant de lignes que de membres
 *   fournis à la génération (mission "ajouter autant de lignes que nécessaire").
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import PizZip from "pizzip";
import { insertIntoParagraph, joinBody, replaceCheckboxesInOrder, splitBody, type BodySegment } from "./docx-template-surgery";

const SOURCE_PATH = join(__dirname, "..", "..", "..", "..", "..", "..", "lm11-formulaires-dc-docx-xml", "dc1-lettre-de-candidature-2019.docx");
const OUTPUT_PATH = join(__dirname, "..", "assets", "dc1-template-v1.docx");

const CHECKBOX_FIELD_KEYS = [
  "dc1.scopeMarcheUnique",
  "dc1.scopeTousLots",
  "dc1.scopeLotSpecifique",
  "dc1.candidatSeul",
  "dc1.groupementEntreprises",
  "dc1.groupementConjoint",
  "dc1.groupementSolidaire",
  "dc1.mandataireSolidaireNon",
  "dc1.mandataireSolidaireOui",
  "dc1.exclusionAttestation",
  "dc1.capacitesViaDc2",
  "dc1.capacitesViaDocuments",
] as const;

const PARAGRAPH_INSERTIONS: readonly { index: number; fieldKey: string }[] = [
  { index: 5, fieldKey: "tender.buyerIdentification" },
  { index: 14, fieldKey: "tender.consultationObject" },
  { index: 35, fieldKey: "dc1.lotNumeros" },
  { index: 46, fieldKey: "candidate.tradeName" },
  { index: 50, fieldKey: "candidate.address" },
  { index: 54, fieldKey: "candidate.email" },
  { index: 58, fieldKey: "candidate.phone" },
  { index: 62, fieldKey: "candidate.siret" },
  { index: 99, fieldKey: "dc1.proofUrl" },
  { index: 103, fieldKey: "dc1.proofAccessInfo" },
  { index: 123, fieldKey: "mandataire.tradeName" },
  { index: 127, fieldKey: "mandataire.address" },
  { index: 131, fieldKey: "mandataire.email" },
  { index: 135, fieldKey: "mandataire.phone" },
  { index: 139, fieldKey: "mandataire.siret" },
];

function insertInCell(cellXml: string, text: string): string {
  const pos = cellXml.lastIndexOf("</w:p></w:tc>");
  if (pos === -1) throw new Error("Expected cell to end with an empty paragraph — table structure may have changed.");
  return cellXml.slice(0, pos) + `<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p></w:tc>`;
}

function transformGroupementTable(tableXml: string): string {
  const rows = tableXml.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) ?? [];
  if (rows.length !== 5) {
    throw new Error(`Expected exactly 5 rows in the groupement members table, found ${rows.length}.`);
  }
  const [header, dataRow] = rows;

  const cells = dataRow!.match(/<w:tc>[\s\S]*?<\/w:tc>/g) ?? [];
  if (cells.length !== 3) {
    throw new Error(`Expected exactly 3 cells in the groupement members data row, found ${cells.length}.`);
  }

  // Reconstruit la ligne de boucle en remplaçant, DANS L'ORDRE, chaque cellule d'origine
  // (préservée telle quelle par ailleurs — bordures/largeurs/style) par sa version avec contenu.
  let loopRow = dataRow!;
  loopRow = loopRow.replace(cells[0]!, insertInCell(cells[0]!, "{{#dc1.members}}{{lotNumber}}"));
  loopRow = loopRow.replace(cells[1]!, insertInCell(cells[1]!, "{{identity}}"));
  loopRow = loopRow.replace(cells[2]!, insertInCell(cells[2]!, "{{prestations}}{{/dc1.members}}"));

  return tableXml.slice(0, tableXml.indexOf("<w:tr")) + header + loopRow + "</w:tbl>";
}

async function main(): Promise<void> {
  const originalBuffer = readFileSync(SOURCE_PATH);
  const zip = new PizZip(originalBuffer);
  const xml = zip.file("word/document.xml")!.asText();

  const bodyMatch = xml.match(/<w:body>([\s\S]*)<\/w:body>/);
  if (!bodyMatch) throw new Error("word/document.xml has no <w:body> — not a valid DOCX.");
  const [, originalBody] = bodyMatch;

  // 1) Cases à cocher héritées -> placeholders CHECKBOX (dans l'ordre du document).
  const bodyWithCheckboxes = replaceCheckboxesInOrder(originalBody!, CHECKBOX_FIELD_KEYS);

  // 2) Zones de texte vides -> placeholders STRING/MULTILINE.
  const segments: BodySegment[] = splitBody(bodyWithCheckboxes);
  for (const insertion of PARAGRAPH_INSERTIONS) {
    insertIntoParagraph(segments, insertion.index, insertion.fieldKey);
  }

  // 3) Table 8 (rubrique E) -> boucle membres du groupement.
  let tableCount = -1;
  const finalSegments = segments.map((segment) => {
    if (segment.kind !== "table") return segment;
    tableCount += 1;
    if (tableCount !== 8) return segment;
    return { kind: "table" as const, xml: transformGroupementTable(segment.xml) };
  });

  const newBody = joinBody(finalSegments);
  const newXml = xml.replace(bodyMatch[0], `<w:body>${newBody}</w:body>`);

  zip.file("word/document.xml", newXml);
  const outputBuffer = zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
  writeFileSync(OUTPUT_PATH, outputBuffer);
  console.log(`Wrote ${outputBuffer.length} bytes to ${OUTPUT_PATH}`);
}

void main();
