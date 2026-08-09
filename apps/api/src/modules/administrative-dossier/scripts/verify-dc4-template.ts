import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import mammoth from "mammoth";
import { DocxtemplaterMergeEngine } from "../../document-generation/infrastructure/docxtemplater-merge-engine";

const TEMPLATE_PATH = join(__dirname, "..", "assets", "dc4-template-v1.docx");
const OUTPUT_PATH = join(__dirname, "..", "assets", "dc4-smoke-output.docx");

const DATA: Record<string, string> = {
  "tender.buyerIdentification": "MARKERBUYER Commune de Test",
  "tender.marketObject": "MARKERMARKETOBJECT Marché de travaux",
  "titulaire.tradeName": "MARKERTITULAIRENOM Titulaire SAS",
  "titulaire.address": "MARKERTITULAIREADR 1 rue du Titulaire",
  "titulaire.email": "MARKERTITULAIREMAIL titulaire@example.test",
  "titulaire.phone": "MARKERTITULAIRETEL 01 00 00 00 01",
  "titulaire.siret": "MARKERTITULAIRESIRET 111 111 111 00011",
  "titulaire.legalForm": "MARKERTITULAIREFORME SAS",
  "subcontractor.tradeName": "MARKERSTNOM Sous-traitant SARL",
  "subcontractor.address": "MARKERSTADR 2 rue du Sous-traitant",
  "subcontractor.email": "MARKERSTMAIL st@example.test",
  "subcontractor.phone": "MARKERSTTEL 02 00 00 00 02",
  "subcontractor.siret": "MARKERSTSIRET 222 222 222 00022",
  "subcontractor.legalForm": "MARKERSTFORME SARL",
  "subcontractor.signatoryName": "MARKERSTSIGNATAIRE M. Dupont",
  "subcontractor.servicesDescription": "MARKERSERVICES Travaux de peinture et revetements",
  "subcontractor.declaredAmount": "MARKERAMOUNT 8 000 EUR",
  "subcontractor.durationMonths": "MARKERDUREE 6",
};

async function main(): Promise<void> {
  const engine = new DocxtemplaterMergeEngine();
  const buffer = readFileSync(TEMPLATE_PATH);

  const placeholders = engine.scanPlaceholders(buffer);
  const found = placeholders.map((p) => p.fieldKey).sort();
  const expected = Object.keys(DATA).sort();
  console.log("Discovered:", found.length, "expected:", expected.length);
  const missing = expected.filter((k) => !found.includes(k));
  const unexpected = found.filter((k) => !expected.includes(k));
  if (missing.length) console.log("MISSING:", missing);
  if (unexpected.length) console.log("UNEXPECTED:", unexpected);
  let allOk = missing.length === 0 && unexpected.length === 0;
  if (allOk) console.log("OK — exact field-key match.");

  const output = engine.render({ templateBuffer: buffer, data: DATA });
  writeFileSync(OUTPUT_PATH, output);
  console.log("Rendered", output.length, "bytes");

  const text = (await mammoth.extractRawText({ buffer: output })).value;
  console.log("mammoth parsed the rendered DOCX successfully — structurally valid.");

  console.log("\n--- Uniqueness checks (each marker appears exactly once) ---");
  for (const value of Object.values(DATA)) {
    const marker = value.split(" ")[0]!;
    const count = text.split(marker).length - 1;
    if (count !== 1) allOk = false;
    console.log(marker, "occurrences:", count, count === 1 ? "OK" : "UNEXPECTED COUNT");
  }

  console.log("\n--- Semantic proximity checks (marker close after the nearest matching label) ---");
  const checks: [string, string, string][] = [
    ["Désignation de l’acheteur :", "MARKERBUYER", "tender.buyerIdentification"],
    ["B - Objet du marché public", "MARKERMARKETOBJECT", "tender.marketObject"],
    ["exécutera la prestation :", "MARKERTITULAIRENOM", "titulaire.tradeName"],
    ["siège social", "MARKERTITULAIREADR", "titulaire.address"],
    ["Adresse électronique :", "MARKERTITULAIREMAIL", "titulaire.email"],
    ["Numéros de téléphone et de télécopie :", "MARKERTITULAIRETEL", "titulaire.phone"],
    ["Numéro SIRET, à défaut", "MARKERTITULAIRESIRET", "titulaire.siret"],
    ["Forme juridique du soumissionnaire", "MARKERTITULAIREFORME", "titulaire.legalForm"],
    ["Personne(s) physique(s) ayant le pouvoir d’engager le sous-traitant :", "MARKERSTSIGNATAIRE", "subcontractor.signatoryName"],
    ["Nature des prestations sous-traitées :", "MARKERSERVICES", "subcontractor.servicesDescription"],
    ["Montant des prestations sous-traitées :", "MARKERAMOUNT", "subcontractor.declaredAmount"],
    ["La durée du contrat de sous-traitance en nombre de mois est de :", "MARKERDUREE", "subcontractor.durationMonths"],
  ];
  for (const [labelText, marker, label] of checks) {
    const markerIdx = text.indexOf(marker);
    const labelIdx = markerIdx === -1 ? -1 : text.lastIndexOf(labelText, markerIdx);
    const distance = markerIdx - labelIdx;
    const ok = labelIdx !== -1 && markerIdx !== -1 && distance > 0 && distance < 60;
    if (!ok) allOk = false;
    console.log(label, ":", ok ? "OK" : `NOT FOUND AS EXPECTED (labelIdx=${labelIdx}, markerIdx=${markerIdx}, distance=${distance})`);
  }

  console.log(allOk ? "\n✅ DC4 template fully verified." : "\n❌ DC4 template verification FAILED — see above.");
  if (!allOk) process.exitCode = 1;
}

void main();
