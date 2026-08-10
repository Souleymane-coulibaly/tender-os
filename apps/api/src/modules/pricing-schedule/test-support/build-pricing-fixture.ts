import PizZip from "pizzip";

/**
 * Fixture XLSX RÉELLE construite à la main, XML par XML (jamais via SheetJS) — nécessaire pour
 * contrôler précisément des éléments que la bibliothèque `xlsx` (édition communautaire) n'écrit pas
 * de façon fiable : styles (`s="1"`), cellules fusionnées, chaînes partagées, formules avec valeur
 * mise en cache. Même précédent que `build-memo-fixture.ts` (Sprint 12) pour DOCX — un fichier
 * représentatif réel plutôt qu'une hypothèse théorique sur un fichier non fourni.
 *
 * Structure :
 *  - Feuille "BPU Lot1" : titre fusionné (A1:D1), en-têtes (B2 "Unité" est en réalité une chaîne
 *    partagée réutilisée deux fois pour prouver la résolution shared-strings), 2 lignes de prix
 *    (désignation/unité/quantité verrouillées, cellule PU vide avec un style numérique s="1"), une
 *    ligne de total avec une FORMULE non ciblée (=D3+D4) à préserver.
 *  - Feuille "DQE Lot1" : contenu totalement indépendant, sert à prouver qu'une feuille non ciblée
 *    reste octet pour octet identique après injection sur l'autre feuille.
 */
const SHARED_STRINGS = [
  "BPU LOT 1",
  "Désignation",
  "Unité",
  "Quantité",
  "PU",
  "Nettoyage des bureaux",
  "m2",
  "Nettoyage des vitres",
  "TOTAL",
  "DQE LOT 1",
  "Poste",
];

function sharedStringsXml(): string {
  const entries = SHARED_STRINGS.map((s) => `<si><t>${escapeXml(s)}</t></si>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${SHARED_STRINGS.length}" uniqueCount="${SHARED_STRINGS.length}">${entries}</sst>`;
}

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
</Types>`;

const ROOT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

const WORKBOOK_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>
<sheet name="BPU Lot1" sheetId="1" r:id="rId1"/>
<sheet name="DQE Lot1" sheetId="2" r:id="rId2"/>
</sheets>
</workbook>`;

const WORKBOOK_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`;

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="2">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
</styleSheet>`;

// Index chaîne partagée : 0=BPU LOT 1, 1=Désignation, 2=Unité, 3=Quantité, 4=PU, 5=Nettoyage des
// bureaux, 6=m2, 7=Nettoyage des vitres, 8=TOTAL.
const SHEET1_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<dimension ref="A1:D5"/>
<sheetViews><sheetView workbookViewId="0"/></sheetViews>
<cols><col min="1" max="1" width="30"/></cols>
<sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c></row>
<row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2" t="s"><v>2</v></c><c r="C2" t="s"><v>3</v></c><c r="D2" t="s"><v>4</v></c></row>
<row r="3"><c r="A3" t="s"><v>5</v></c><c r="B3" t="s"><v>6</v></c><c r="C3"><v>120</v></c><c r="D3" s="1"/></row>
<row r="4"><c r="A4" t="s"><v>7</v></c><c r="B4" t="s"><v>6</v></c><c r="C4"><v>45</v></c><c r="D4" s="1"/></row>
<row r="5"><c r="A5" t="s"><v>8</v></c><c r="D5"><f>D3+D4</f><v>0</v></c></row>
</sheetData>
<mergeCells count="1"><mergeCell ref="A1:D1"/></mergeCells>
</worksheet>`;

// Index chaîne partagée : 9=DQE LOT 1, 10=Poste.
const SHEET2_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<dimension ref="A1:B2"/>
<sheetViews><sheetView workbookViewId="0"/></sheetViews>
<sheetData>
<row r="1"><c r="A1" t="s"><v>9</v></c></row>
<row r="2"><c r="A2" t="s"><v>10</v></c><c r="B2"><v>1</v></c></row>
</sheetData>
</worksheet>`;

export function buildPricingFixtureBuffer(): Buffer {
  const zip = new PizZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES_XML);
  zip.file("_rels/.rels", ROOT_RELS_XML);
  zip.file("xl/workbook.xml", WORKBOOK_XML);
  zip.file("xl/_rels/workbook.xml.rels", WORKBOOK_RELS_XML);
  zip.file("xl/styles.xml", STYLES_XML);
  zip.file("xl/sharedStrings.xml", sharedStringsXml());
  zip.file("xl/worksheets/sheet1.xml", SHEET1_XML);
  zip.file("xl/worksheets/sheet2.xml", SHEET2_XML);
  return zip.generate({ type: "nodebuffer" });
}

/** Références de cellule stables utilisées par les tests — jamais recalculées, toujours cohérentes
 *  avec `SHEET1_XML`/`SHEET2_XML` ci-dessus. */
export const PRICING_FIXTURE_REFERENCES = {
  sheet1Name: "BPU Lot1",
  sheet2Name: "DQE Lot1",
  designationCellRow3: "A3",
  puCellRow3: "D3",
  puCellRow4: "D4",
  totalFormulaCell: "D5",
  mergedTitleCell: "A1",
} as const;
