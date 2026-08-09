import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import mammoth from "mammoth";
import { DocxtemplaterMergeEngine } from "../../document-generation/infrastructure/docxtemplater-merge-engine";

const TEMPLATE_PATH = join(__dirname, "..", "assets", "dc2-template-v1.docx");
const OUTPUT_PATH = join(__dirname, "..", "assets", "dc2-smoke-output.docx");

const DATA: Record<string, string> = {
  "candidate.tradeName": "MARKERNOM Etablissements Marchand Freres",
  "candidate.address": "MARKERADR 5 avenue de la Republique, 69002 Lyon",
  "candidate.email": "MARKEREMAIL contact@marchand.example",
  "candidate.phone": "MARKERTEL 04 00 00 00 04",
  "candidate.siret": "MARKERSIRET 456 456 456 00045",
  "candidate.legalForm": "MARKERFORME SAS",
  "dc2.pmeOui": "☒",
  "dc2.pmeNon": "☐",
  "dc2.reservedMarketCheckbox1": "☐",
  "dc2.reservedMarketCheckbox2": "☐",
  "dc2.reservedMarketCheckbox3": "☐",
  "dc2.officialListCheckbox1": "☐",
  "dc2.officialListCheckbox2": "☐",
  "dc2.insuranceCheckbox": "☐",
  "dc2.otherOperatorsCheckbox": "☐",
};

const EXPECTED_FIELD_KEYS = Object.keys(DATA).sort();

async function main(): Promise<void> {
  const engine = new DocxtemplaterMergeEngine();
  const buffer = readFileSync(TEMPLATE_PATH);

  const placeholders = engine.scanPlaceholders(buffer);
  const found = placeholders.map((p) => p.fieldKey).sort();
  console.log("Discovered:", found.length, "placeholders, expected:", EXPECTED_FIELD_KEYS.length);
  const missing = EXPECTED_FIELD_KEYS.filter((k) => !found.includes(k));
  const unexpected = found.filter((k) => !EXPECTED_FIELD_KEYS.includes(k));
  if (missing.length > 0) console.log("MISSING:", missing);
  if (unexpected.length > 0) console.log("UNEXPECTED:", unexpected);
  let allOk = missing.length === 0 && unexpected.length === 0;
  if (allOk) console.log("OK — exact match with the planned field list.");

  const output = engine.render({ templateBuffer: buffer, data: DATA });
  writeFileSync(OUTPUT_PATH, output);
  console.log("Rendered", output.length, "bytes");

  const text = (await mammoth.extractRawText({ buffer: output })).value;
  console.log("mammoth parsed the rendered DOCX successfully — structurally valid.");

  console.log("\n--- Uniqueness checks (each marker appears exactly once) ---");
  for (const value of Object.values(DATA)) {
    if (!value.startsWith("MARKER")) continue;
    const marker = value.split(" ")[0]!;
    const count = text.split(marker).length - 1;
    if (count !== 1) allOk = false;
    console.log(marker, "occurrences:", count, count === 1 ? "OK" : "UNEXPECTED COUNT");
  }

  console.log("\n--- Semantic proximity checks ---");
  const checks: [string, string, string][] = [
    ["exécutera la prestation :", "MARKERNOM", "candidate.tradeName"],
    ["siège social", "MARKERADR", "candidate.address"],
    ["Adresse électronique :", "MARKEREMAIL", "candidate.email"],
    ["Numéros de téléphone et de télécopie :", "MARKERTEL", "candidate.phone"],
    ["Numéro SIRET, à défaut", "MARKERSIRET", "candidate.siret"],
    ["Forme juridique du candidat individuel", "MARKERFORME", "candidate.legalForm"],
  ];
  for (const [labelText, marker, label] of checks) {
    const markerIdx = text.indexOf(marker);
    const labelIdx = markerIdx === -1 ? -1 : text.lastIndexOf(labelText, markerIdx);
    const distance = markerIdx - labelIdx;
    const ok = labelIdx !== -1 && markerIdx !== -1 && distance > 0 && distance < 80;
    if (!ok) allOk = false;
    console.log(label, ":", ok ? "OK" : `NOT FOUND AS EXPECTED (labelIdx=${labelIdx}, markerIdx=${markerIdx}, distance=${distance})`);
  }

  console.log("\n--- PME checkbox placement (Oui/Non near the PME question) ---");
  const pmeIdx = text.indexOf("micro, une petite ou une moyenne entreprise");
  const ouiIdx = text.indexOf("☒", pmeIdx);
  console.log("PME question at", pmeIdx, "checked glyph found at", ouiIdx, ouiIdx > pmeIdx && ouiIdx - pmeIdx < 200 ? "OK (glyph near the PME question)" : "CHECK MANUALLY");

  if (allOk) {
    console.log("\n✅ DC2 template field placement verified.");
  } else {
    console.log("\n❌ DC2 template verification FAILED — see above.");
    process.exitCode = 1;
  }
}

void main();
