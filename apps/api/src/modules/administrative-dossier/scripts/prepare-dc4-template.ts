/**
 * Prépare UNE FOIS la copie dérivée TenderOS du DC4 officiel réel fourni (mission V2 Sprint 11,
 * décision validée §"copie dérivée avec tags insérés"). Le fichier officiel
 * (`dc4-declaration-de-sous-traitance-2023.docx`, DAJ, Licence Ouverte Etalab 2.0) N'EST JAMAIS
 * modifié. Résultat écrit sous `assets/dc4-template-v1.docx`.
 *
 * PÉRIMÈTRE RÉDUIT ASSUMÉ (mission §3 "STOP pour ce formulaire précis et documenter le problème",
 * appliqué au niveau du champ plutôt que du formulaire entier) — corrigé après audit Codex (le
 * premier passage avait exclu par excès de prudence des champs simples de F/G/I aux côtés des
 * champs réellement complexes de C/G/H/J/K/L/M, sans les distinguer un à un) :
 *
 * MAPPÉS (paragraphe vide simple après le libellé, même motif que A/B/D/E déjà traité) :
 *   - Rubrique A (acheteur), B (objet du marché) : P20, P27.
 *   - Rubrique D (titulaire) : P50, P54, P56, P58, P60, P63.
 *   - Rubrique E (sous-traitant, identité) : P72, P74, P76, P79, P82, P85, P88.
 *   - Rubrique F, "Nature des prestations sous-traitées :" (P101) -> P102 (paragraphe vide simple,
 *     vérifié par inspection directe du texte réel — n'a JAMAIS dû rester exclu).
 *   - Rubrique G, "Montant des prestations sous-traitées :" (P124) -> P125 (paragraphe vide
 *     simple, montant global déclaratif — distinct des 3 déclinaisons conditionnelles HT/TTC/
 *     auto-liquidation qui suivent, elles-mêmes non mappées, voir ci-dessous).
 *   - Rubrique I, "La durée du contrat de sous-traitance en nombre de mois est de :" (P165) ->
 *     P166 (paragraphe vide simple).
 *
 * VOLONTAIREMENT NON mappés (raison technique réelle, vérifiée par inspection, pas une exclusion
 * par défaut) :
 *   - Rubrique C (nature de la déclaration : annexée à l'offre / acte spécial / acte modificatif) :
 *     3 cases à cocher exclusives, aucune donnée métier TenderOS équivalente (pas de concept de
 *     "type de déclaration" sur `SubcontractorDeclaration`).
 *   - Rubrique F (sous-traitance de données personnelles, P103-P120) : bloc RGPD conditionnel
 *     entier, hors modèle métier actuel.
 *   - Rubrique G, "Taux de la TVA : …………" (P129) : blanc EN LIGNE dans le même paragraphe que le
 *     libellé (pas un paragraphe séparé) — motif XML distinct, non traité cette version. Idem pour
 *     les 2 autres déclinaisons conditionnelles de montant (HT/TTC/auto-liquidation, P130-P135).
 *   - Rubrique G, "paiement direct" / Rubrique H, "avance" (P143-P148, P156-P159) : case à cocher
 *     dessinée en forme vectorielle flottante (`w:pict`/`v:shape`), aucun mécanisme natif
 *     `w:ffData` comme DC1/DC2.
 *   - Rubriques J/K/L/M (capacités, attestations, signature) : hors périmètre données structurées
 *     actuelles (J1/J2 sont des blocs de texte libre étendus, K/L sont des attestations avec cases
 *     à cocher vectorielles).
 *
 * "lotReference" (mentionné dans l'audit) n'a PAS de champ équivalent sur l'agrégat
 * `SubcontractorDeclaration` (vérifié — aucune notion de lot n'y est stockée) : rien à mapper,
 * jamais une valeur inventée pour combler une absence de modèle.
 *
 * Indices de paragraphe vérifiés par extraction réelle (0-indexé, en tenant compte de la découpe
 * correcte `<w:p>` vs `<w:p attrs>`).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import PizZip from "pizzip";
import { insertIntoParagraph, joinBody, splitBody, type BodySegment } from "./docx-template-surgery";

const SOURCE_PATH = join(__dirname, "..", "..", "..", "..", "..", "..", "lm11-formulaires-dc-docx-xml", "dc4-declaration-de-sous-traitance-2023.docx");
const OUTPUT_PATH = join(__dirname, "..", "assets", "dc4-template-v1.docx");

const PARAGRAPH_INSERTIONS: readonly { index: number; fieldKey: string }[] = [
  { index: 20, fieldKey: "tender.buyerIdentification" },
  { index: 27, fieldKey: "tender.marketObject" },
  { index: 50, fieldKey: "titulaire.tradeName" },
  { index: 53, fieldKey: "titulaire.address" },
  { index: 55, fieldKey: "titulaire.email" },
  { index: 57, fieldKey: "titulaire.phone" },
  { index: 59, fieldKey: "titulaire.siret" },
  { index: 62, fieldKey: "titulaire.legalForm" },
  { index: 71, fieldKey: "subcontractor.tradeName" },
  { index: 73, fieldKey: "subcontractor.address" },
  { index: 75, fieldKey: "subcontractor.email" },
  { index: 78, fieldKey: "subcontractor.phone" },
  { index: 81, fieldKey: "subcontractor.siret" },
  { index: 84, fieldKey: "subcontractor.legalForm" },
  { index: 87, fieldKey: "subcontractor.signatoryName" },
  { index: 102, fieldKey: "subcontractor.servicesDescription" },
  { index: 125, fieldKey: "subcontractor.declaredAmount" },
  { index: 166, fieldKey: "subcontractor.durationMonths" },
];

async function main(): Promise<void> {
  const originalBuffer = readFileSync(SOURCE_PATH);
  const zip = new PizZip(originalBuffer);
  const xml = zip.file("word/document.xml")!.asText();

  const bodyMatch = xml.match(/<w:body>([\s\S]*)<\/w:body>/);
  if (!bodyMatch) throw new Error("word/document.xml has no <w:body> — not a valid DOCX.");
  const [, originalBody] = bodyMatch;

  const segments: BodySegment[] = splitBody(originalBody!);
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
