import PizZip from "pizzip";
import { describe, expect, it } from "vitest";
import { buildMemoTemplateFixture } from "../test-support/build-memo-fixture";
import { extractOutline, insertNewParagraphAfter, insertPlaceholdersForSections, joinBody, rebuildDocxWithBody, splitBody } from "./docx-outline-extractor";

async function loadBody(): Promise<string> {
  const buffer = await buildMemoTemplateFixture();
  const zip = new PizZip(buffer);
  const xml = zip.file("word/document.xml")!.asText();
  const bodyMatch = xml.match(/<w:body>([\s\S]*)<\/w:body>/);
  if (!bodyMatch) throw new Error("no <w:body>");
  return bodyMatch[1]!;
}

describe("docx-outline-extractor — real DOCX fixture (logo, header/footer, headings, table, styles, empty zones)", () => {
  it("splitBody round-trips byte-identical on a real generated DOCX", async () => {
    const body = await loadBody();
    const segments = splitBody(body);
    expect(joinBody(segments)).toBe(body);
  });

  it("detects every heading with its correct level and title text, in document order", async () => {
    const body = await loadBody();
    const segments = splitBody(body);
    const outline = extractOutline(segments);

    const titles = outline.map((h) => ({ level: h.level, title: h.title }));
    expect(titles).toEqual([
      { level: 1, title: "1. Présentation de l'entreprise" },
      { level: 1, title: "2. Compréhension du besoin" },
      { level: 2, title: "2.1 Contexte" },
      { level: 2, title: "2.2 Enjeux" },
      { level: 1, title: "3. Méthodologie" },
      { level: 1, title: "4. Moyens humains" },
      { level: 1, title: "5. Références" },
    ]);
  });

  it("builds the correct parent/child hierarchy (2.1 and 2.2 nested under section 2)", async () => {
    const body = await loadBody();
    const outline = extractOutline(splitBody(body));
    const section2 = outline.find((h) => h.title === "2. Compréhension du besoin")!;
    const section21 = outline.find((h) => h.title === "2.1 Contexte")!;
    const section22 = outline.find((h) => h.title === "2.2 Enjeux")!;
    const section3 = outline.find((h) => h.title === "3. Méthodologie")!;

    expect(section21.parentSegmentIndex).toBe(section2.segmentIndex);
    expect(section22.parentSegmentIndex).toBe(section2.segmentIndex);
    expect(section3.parentSegmentIndex).toBeUndefined(); // niveau 1, pas de parent
  });

  it("captures instruction text found before the next heading, never invented", async () => {
    const body = await loadBody();
    const outline = extractOutline(splitBody(body));
    const presentation = outline.find((h) => h.title === "1. Présentation de l'entreprise")!;
    const methodology = outline.find((h) => h.title === "3. Méthodologie")!;
    const references = outline.find((h) => h.title === "5. Références")!;

    expect(presentation.instructionText).toContain("Présentez votre entreprise");
    expect(methodology.instructionText).toContain("Décrivez votre méthodologie");
    // Section 5 n'a aucun texte avant la fin du document — jamais une instruction inventée.
    expect(references.instructionText).toBeUndefined();
  });

  it("detects that a table sits inside the 'Moyens humains' answer zone", async () => {
    const body = await loadBody();
    const outline = extractOutline(splitBody(body));
    const humanResources = outline.find((h) => h.title === "4. Moyens humains")!;
    const methodology = outline.find((h) => h.title === "3. Méthodologie")!;

    expect(humanResources.isTable).toBe(true);
    expect(methodology.isTable).toBe(false);
  });

  it("insertNewParagraphAfter never modifies existing paragraphs — original text stays intact, byte-for-byte, elsewhere", async () => {
    const body = await loadBody();
    const segments = splitBody(body);
    const outline = extractOutline(segments);
    const presentation = outline[0]!;

    const withPlaceholder = insertNewParagraphAfter(segments, presentation.segmentIndex, "section.s1");
    expect(withPlaceholder).toHaveLength(segments.length + 1);
    expect(withPlaceholder[presentation.segmentIndex + 1]!.xml).toContain("{{section.s1}}");

    // Retirer EXACTEMENT le nouveau segment redonne, octet pour octet, le corps original — preuve
    // que l'insertion n'a rien modifié/déplacé/supprimé ailleurs (mission §13).
    const withoutInsertion = [...withPlaceholder];
    withoutInsertion.splice(presentation.segmentIndex + 1, 1);
    expect(joinBody(withoutInsertion)).toBe(body);
  });

  it("BLOQUANT — insertPlaceholdersForSections places every placeholder correctly for ALL 7 headings at once, preserving all original content", async () => {
    const body = await loadBody();
    const segments = splitBody(body);
    const outline = extractOutline(segments);

    const placements = outline.map((heading, index) => ({ segmentIndex: heading.segmentIndex, fieldKey: `section-${index}` }));
    const result = insertPlaceholdersForSections(segments, placements);

    expect(result).toHaveLength(segments.length + outline.length);

    // Chaque placeholder apparaît EXACTEMENT une fois, dans le document résultant.
    for (let i = 0; i < placements.length; i++) {
      const matches = result.filter((segment) => segment.xml.includes(`{{section-${i}}}`));
      expect(matches).toHaveLength(1);
    }

    // Retirer tous les segments insérés (identifiés par leur contenu placeholder, jamais présent
    // dans le document original) redonne, octet pour octet, le corps original — preuve qu'aucune
    // insertion multiple n'a corrompu/déplacé du contenu existant (mission §13).
    const withoutInsertions = result.filter((segment) => !/\{\{section-\d+\}\}/.test(segment.xml));
    expect(joinBody(withoutInsertions)).toBe(body);
  });

  it("rebuildDocxWithBody keeps everything but the body identical (header/footer/logo/styles untouched)", async () => {
    const buffer = await buildMemoTemplateFixture();
    const zip = new PizZip(buffer);
    const originalXml = zip.file("word/document.xml")!.asText();
    const headerBefore = zip.file(/word\/header1\.xml/)[0]!.asText();

    const body = originalXml.match(/<w:body>([\s\S]*)<\/w:body>/)![1]!;
    const modifiedBody = body.replace("2. Compréhension du besoin", "2. Compréhension du besoin (modifié)");
    const rebuilt = rebuildDocxWithBody(buffer, modifiedBody);

    const rebuiltZip = new PizZip(rebuilt);
    const rebuiltXml = rebuiltZip.file("word/document.xml")!.asText();
    expect(rebuiltXml).toContain("Compréhension du besoin (modifié)");
    expect(rebuiltZip.file(/word\/header1\.xml/)[0]!.asText()).toBe(headerBefore);
  });
});
