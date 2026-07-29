import JSZip from "jszip";

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`;

const PACKAGE_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOCUMENT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>`;

const NUMBERING_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>`;

/** Construit un DOCX minimal mais structurellement valide (titre, paragraphe, tableau, liste) —
 *  jamais un fichier binaire versionné ni un appel réseau : les tests d'extraction DOCX restent
 *  déterministes et hors-ligne. Lisible par `mammoth` comme par tout lecteur OOXML conforme. */
export async function buildMinimalDocx(input?: {
  heading?: string;
  paragraph?: string;
  table?: readonly (readonly string[])[];
  listItems?: readonly string[];
}): Promise<Buffer> {
  const heading = input?.heading ?? "Section One";
  const paragraph = input?.paragraph ?? "This is a normal paragraph.";
  const table = input?.table ?? [
    ["Cell A1", "Cell B1"],
    ["Cell A2", "Cell B2"],
  ];
  const listItems = input?.listItems ?? ["List item one", "List item two"];

  const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const tableXml = `<w:tbl>${table
    .map(
      (row) =>
        `<w:tr>${row.map((cell) => `<w:tc><w:p><w:r><w:t>${escape(cell)}</w:t></w:r></w:p></w:tc>`).join("")}</w:tr>`,
    )
    .join("")}</w:tbl>`;

  const listXml = listItems
    .map(
      (item) =>
        `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>${escape(item)}</w:t></w:r></w:p>`,
    )
    .join("");

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>${escape(heading)}</w:t></w:r></w:p>
<w:p><w:r><w:t>${escape(paragraph)}</w:t></w:r></w:p>
${tableXml}
${listXml}
</w:body>
</w:document>`;

  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES);
  zip.file("_rels/.rels", PACKAGE_RELS);
  zip.file("word/document.xml", documentXml);
  zip.file("word/_rels/document.xml.rels", DOCUMENT_RELS);
  zip.file("word/numbering.xml", NUMBERING_XML);
  return zip.generateAsync({ type: "nodebuffer" });
}

/** DOCX structurellement valide mais sans aucun contenu textuel — pour les tests "document
 *  vide" (mission Sprint 3 §19). */
export async function buildEmptyDocx(): Promise<Buffer> {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body></w:body>
</w:document>`;
  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES);
  zip.file("_rels/.rels", PACKAGE_RELS);
  zip.file("word/document.xml", documentXml);
  return zip.generateAsync({ type: "nodebuffer" });
}
