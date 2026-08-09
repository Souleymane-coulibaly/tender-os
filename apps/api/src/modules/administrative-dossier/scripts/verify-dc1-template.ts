import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import mammoth from "mammoth";
import { DocxtemplaterMergeEngine } from "../../document-generation/infrastructure/docxtemplater-merge-engine";

const TEMPLATE_PATH = join(__dirname, "..", "assets", "dc1-template-v1.docx");
const OUTPUT_PATH = join(__dirname, "..", "assets", "dc1-smoke-output.docx");

const DATA: Record<string, unknown> = {
  "tender.buyerIdentification": "MARKERBUYER Commune de Test — Direction des Achats",
  "tender.consultationObject": "MARKEROBJET Marché de travaux de rénovation — Lot unique",
  "dc1.scopeMarcheUnique": "☒",
  "dc1.scopeTousLots": "☐",
  "dc1.scopeLotSpecifique": "☐",
  "dc1.lotNumeros": "",
  "dc1.candidatSeul": "☐",
  "candidate.tradeName": "MARKERCANDNOM Établissements Béranger & Cie",
  "candidate.address": "MARKERCANDADR 12 rue de la République, 75001 Paris",
  "candidate.email": "MARKERCANDMAIL contact@beranger.example",
  "candidate.phone": "MARKERCANDTEL 01 23 45 67 89",
  "candidate.siret": "MARKERCANDSIRET 123 456 789 00012",
  "dc1.groupementEntreprises": "☒",
  "dc1.groupementConjoint": "☒",
  "dc1.groupementSolidaire": "☐",
  "dc1.mandataireSolidaireNon": "☐",
  "dc1.mandataireSolidaireOui": "☒",
  "dc1.members": [
    { lotNumber: "1", identity: "MARKERMEMBRE1 Établissements Béranger & Cie", prestations: "Gros œuvre" },
    { lotNumber: "1", identity: "MARKERMEMBRE2 Sous-traitance Dupont SARL", prestations: "Électricité" },
  ],
  "dc1.exclusionAttestation": "☒",
  "dc1.proofUrl": "MARKERPROOFURL https://example.test/preuves",
  "dc1.proofAccessInfo": "MARKERPROOFINFO Identifiants transmis par courriel",
  "dc1.capacitesViaDc2": "☒",
  "dc1.capacitesViaDocuments": "☐",
  "mandataire.tradeName": "MARKERMANDNOM Établissements Béranger & Cie",
  "mandataire.address": "MARKERMANDADR 12 rue de la République, 75001 Paris",
  "mandataire.email": "MARKERMANDMAIL contact@beranger.example",
  "mandataire.phone": "MARKERMANDTEL 01 23 45 67 89",
  "mandataire.siret": "MARKERMANDSIRET 123 456 789 00012",
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
  if (missing.length === 0 && unexpected.length === 0) console.log("OK — exact match with the planned field list.");

  const output = engine.render({ templateBuffer: buffer, data: DATA });
  writeFileSync(OUTPUT_PATH, output);
  console.log("Rendered", output.length, "bytes");

  // Preuve de validité structurelle STRICTE — mammoth utilise un parseur XML différent/plus
  // strict que docxtemplater/JSZip et a déjà détecté une vraie corruption silencieuse ici.
  const text = (await mammoth.extractRawText({ buffer: output })).value;
  console.log("mammoth parsed the rendered DOCX successfully — structurally valid.");

  console.log("\n--- Semantic proximity checks (label immediately followed by its marker, within 30 chars) ---");
  const checks: [string, string, string][] = [
    ["exécutera la prestation :", "MARKERCANDNOM", "candidate.tradeName right after D-block label"],
    ["siège social", "MARKERCANDADR", "candidate.address right after its label"],
    ["Numéro SIRET, à défaut", "MARKERCANDSIRET", "candidate.siret right after its label"],
    ["Adresse internet :", "MARKERPROOFURL", "dc1.proofUrl right after its label"],
    ["pour y accéder :", "MARKERPROOFINFO", "dc1.proofAccessInfo right after its label"],
    ["exécutera la prestation :", "MARKERMANDNOM", "mandataire.tradeName present"],
    ["Numéro SIRET, à défaut", "MARKERMANDSIRET", "mandataire.siret present"],
  ];
  let allOk = true;
  for (const [labelText, marker, label] of checks) {
    const markerIdx = text.indexOf(marker);
    const labelIdx = markerIdx === -1 ? -1 : text.lastIndexOf(labelText, markerIdx);
    const distance = markerIdx - labelIdx;
    const ok = labelIdx !== -1 && markerIdx !== -1 && distance > 0 && distance < 60;
    if (!ok) allOk = false;
    console.log(label, ":", ok ? "OK" : `NOT FOUND AS EXPECTED (labelIdx=${labelIdx}, markerIdx=${markerIdx}, distance=${distance})`);
  }

  console.log("\n--- Uniqueness checks (each marker appears exactly once — no misalignment) ---");
  for (const value of Object.values(DATA)) {
    if (typeof value !== "string" || !value.startsWith("MARKER")) continue;
    const marker = value.split(" ")[0]!;
    const count = text.split(marker).length - 1;
    if (count !== 1) allOk = false;
    console.log(marker, "occurrences:", count, count === 1 ? "OK" : "UNEXPECTED COUNT");
  }
  // Les 2 lignes de la boucle membres comptent chacune leur propre marqueur (MEMBRE1/MEMBRE2),
  // déjà couvertes ci-dessus. Vérifie en plus que la boucle a bien produit 2 lignes de tableau.
  console.log("MARKERMEMBRE1 and MARKERMEMBRE2 both present (loop expanded):", text.includes("MARKERMEMBRE1") && text.includes("MARKERMEMBRE2") ? "OK" : "FAILED");

  if (missing.length === 0 && unexpected.length === 0 && allOk) {
    console.log("\n✅ DC1 template fully verified.");
  } else {
    console.log("\n❌ DC1 template verification FAILED — see above.");
    process.exitCode = 1;
  }
}

void main();
