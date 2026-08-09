/**
 * Prépare UNE FOIS la copie dérivée TenderOS du DC2 officiel réel fourni (mission V2 Sprint 11B,
 * même pattern validé que DC1/DC4 : copie dérivée + tags insérés, original JAMAIS modifié).
 * Résultat écrit sous `assets/dc2-template-v1.docx`.
 *
 * PÉRIMÈTRE RÉDUIT ASSUMÉ (mission "STOP pour ce champ précis et documenter", appliqué champ par
 * champ après inspection réelle du DOCX — 223 paragraphes, 12 tableaux) :
 *
 * MAPPÉS (rubrique C1 "Cas général" — identité du candidat/membre, paragraphe vide simple après le
 * libellé, même motif que DC1/DC4) :
 *   P37  nom commercial / dénomination sociale
 *   P40  adresse postale / siège social
 *   P43  adresse électronique
 *   P46  numéro de téléphone
 *   P49  numéro SIRET
 *   P52  forme juridique
 * + case à cocher native (`w:ffData`/FORMCHECKBOX, 9 occurrences dans tout le document, MÊME
 *   mécanisme que DC1/DC2 déjà audité) — seules les 2 PREMIÈRES (Oui/Non "micro/petite/moyenne
 *   entreprise", rubrique C1) sont réellement résolues côté résolveur ; les 7 suivantes reçoivent un
 *   `fieldKey` (obligatoire pour `replaceCheckboxesInOrder`, qui exige un compte EXACT) mais restent
 *   volontairement `NOT_APPLICABLE`/jamais résolues.
 *
 * VOLONTAIREMENT NON mappés cette version (raison technique réelle vérifiée par inspection, jamais
 * une exclusion par défaut) :
 *   - Identification acheteur / objet de la consultation : contrairement à DC1 (paragraphes
 *     simples), le DC2 réel les place DANS DES TABLEAUX (TABLE 1/TABLE 2) — mécanisme d'insertion
 *     en cellule non encore construit, reporté.
 *   - C2 (marché réservé), C3 (liste officielle/déclaration simplifiée) : blocs conditionnels
 *     mêlant cases à cocher et texte libre multi-paragraphe, aucune donnée métier TenderOS
 *     équivalente de toute façon (aucun concept "marché réservé"/"liste officielle" sur
 *     `CompanyLegalIdentity`).
 *   - E1 (registre professionnel), E2 (autorisation spécifique) : aucune donnée métier TenderOS
 *     équivalente.
 *   - E3, F4, G2 (adresses de preuves en ligne) : mappables en théorie (même motif que
 *     `dc1.proofUrl`/`proofAccessInfo`) mais reportées pour concentrer le budget sur les champs à
 *     donnée réelle disponible.
 *   - F1 (chiffres d'affaires 3 exercices) : DANS UN TABLEAU (TABLE 7) — ET aucune donnée de
 *     capacité financière (CA) n'existe nulle part dans le modèle `CompanyLegalIdentity`/satellites
 *     audité (mission §11 "si l'information n'existe pas : MISSING, jamais 0 par défaut" — de toute
 *     façon vrai même si le tableau était mappé).
 *   - F2/F3 (autres infos éco/financières, assurance décennale) : case à cocher + texte libre
 *     conditionnel, aucune donnée métier équivalente.
 *   - G1 (capacité technique — effectifs/moyens/références) : texte libre long ; `CompanyProfile`
 *     a bien des satellites (`references`/`humanResources`/`materialResources`) mais les agréger en
 *     un unique texte de formulaire est une décision de synthèse hors périmètre de ce sprint.
 *   - H (opérateurs tiers dont le candidat s'appuie sur les capacités) : tableau répétable (TABLE
 *     9/10), aucune donnée TenderOS équivalente.
 *   - I1/I2 (nationalité, MDS) : hors périmètre, aucune donnée équivalente.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import PizZip from "pizzip";
import { insertIntoParagraph, joinBody, replaceCheckboxesInOrder, splitBody, type BodySegment } from "./docx-template-surgery";

const SOURCE_PATH = join(__dirname, "..", "..", "..", "..", "..", "..", "lm11-formulaires-dc-docx-xml", "dc2-declaration-du-candidat-2023.docx");
const OUTPUT_PATH = join(__dirname, "..", "assets", "dc2-template-v1.docx");

const PARAGRAPH_INSERTIONS: readonly { index: number; fieldKey: string }[] = [
  { index: 37, fieldKey: "candidate.tradeName" },
  { index: 40, fieldKey: "candidate.address" },
  { index: 43, fieldKey: "candidate.email" },
  { index: 46, fieldKey: "candidate.phone" },
  { index: 49, fieldKey: "candidate.siret" },
  { index: 52, fieldKey: "candidate.legalForm" },
];

/** Ordre d'apparition réel dans le document (9 cases à cocher natives au total) — seules les 2
 *  premières (PME oui/non) sont réellement résolues par le résolveur. */
const CHECKBOX_FIELD_KEYS: readonly string[] = [
  "dc2.pmeOui",
  "dc2.pmeNon",
  "dc2.reservedMarketCheckbox1",
  "dc2.reservedMarketCheckbox2",
  "dc2.reservedMarketCheckbox3",
  "dc2.officialListCheckbox1",
  "dc2.officialListCheckbox2",
  "dc2.insuranceCheckbox",
  "dc2.otherOperatorsCheckbox",
];

async function main(): Promise<void> {
  const originalBuffer = readFileSync(SOURCE_PATH);
  const zip = new PizZip(originalBuffer);
  const xml = zip.file("word/document.xml")!.asText();

  const bodyMatch = xml.match(/<w:body>([\s\S]*)<\/w:body>/);
  if (!bodyMatch) throw new Error("word/document.xml has no <w:body> — not a valid DOCX.");
  const [, originalBody] = bodyMatch;

  const bodyWithCheckboxes = replaceCheckboxesInOrder(originalBody!, CHECKBOX_FIELD_KEYS);

  const segments: BodySegment[] = splitBody(bodyWithCheckboxes);
  for (const insertion of PARAGRAPH_INSERTIONS) {
    insertIntoParagraph(segments, insertion.index, insertion.fieldKey);
  }

  const newBody = joinBody(segments);
  const newXml = xml.replace(bodyMatch[0], `<w:body>${newBody}</w:body>`);

  zip.file("word/document.xml", newXml);
  const outputBuffer = zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
  writeFileSync(OUTPUT_PATH, outputBuffer);
  console.log(`Wrote ${outputBuffer.length} bytes to ${OUTPUT_PATH}`);
}

void main();
