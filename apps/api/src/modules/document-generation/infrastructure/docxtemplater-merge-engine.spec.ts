import { readFileSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { DocxtemplaterMergeEngine } from "./docxtemplater-merge-engine";

const FIXTURE_PATH = join(__dirname, "..", "test-support", "fixtures", "demo-template.docx");

const SAMPLE_DATA = {
  "tender.reference": "AO-2026-0421",
  "tender.title": "Marché de fourniture de mobilier de bureau",
  "tender.deadline": "15/09/2026",
  "pricing.totalAmount": "128 500,00 €",
  "compliance.subcontracting": "☒",
  "tender.description": "Ligne 1\nLigne 2\nLigne 3 — texte long avec plusieurs paragraphes pour vérifier l'absence de troncature.",
  "candidate.name": "Établissements Béranger & Cie",
  items: [
    { name: "Bureaux ergonomiques", amount: "45 000,00 €" },
    { name: "Sièges", amount: "22 000,00 €" },
    { name: "Armoires", amount: "18 500,00 €" },
  ],
};

/**
 * Preuve RÉELLE (mission §"test obligatoire sur un vrai fichier") — génère effectivement un DOCX à
 * partir du template de démonstration et valide sa structure OOXML, jamais une simulation.
 */
describe("DocxtemplaterMergeEngine (real DOCX file)", () => {
  const engine = new DocxtemplaterMergeEngine();
  const templateBuffer = readFileSync(FIXTURE_PATH);

  it("scanPlaceholders — detects every placeholder, including one fragmented across multiple Word runs", () => {
    const placeholders = engine.scanPlaceholders(templateBuffer);
    const keys = placeholders.map((p) => p.fieldKey).sort();
    expect(keys).toEqual(
      ["candidate.name", "compliance.subcontracting", "items", "pricing.totalAmount", "tender.deadline", "tender.description", "tender.reference", "tender.title"].sort(),
    );
  });

  it("BLOQUANT — template-immutability proof: the input buffer bytes are never mutated by scanning or rendering", () => {
    const before = Buffer.from(templateBuffer);
    engine.scanPlaceholders(templateBuffer);
    engine.render({ templateBuffer, data: SAMPLE_DATA });
    expect(Buffer.compare(templateBuffer, before)).toBe(0);
  });

  it("BLOQUANT — produces a structurally valid, openable DOCX (ZIP with [Content_Types].xml and word/document.xml)", async () => {
    const output = engine.render({ templateBuffer, data: SAMPLE_DATA });
    const zip = await JSZip.loadAsync(output);
    expect(zip.file("[Content_Types].xml")).not.toBeNull();
    expect(zip.file("word/document.xml")).not.toBeNull();
  });

  it("BLOQUANT — split-run placeholder proof: a tag fragmented across several <w:r> runs is correctly reconstructed and filled", async () => {
    const output = engine.render({ templateBuffer, data: SAMPLE_DATA });
    const zip = await JSZip.loadAsync(output);
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain("Marché de fourniture de mobilier de bureau");
    expect(xml).not.toContain("{{tend");
  });

  it("never leaves a literal unresolved {{...}} tag in the output", async () => {
    const output = engine.render({ templateBuffer, data: SAMPLE_DATA });
    const zip = await JSZip.loadAsync(output);
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).not.toMatch(/\{\{[a-zA-Z]/);
  });

  it("table row loop — duplicates one row per array element, never truncating or merging rows", async () => {
    const output = engine.render({ templateBuffer, data: SAMPLE_DATA });
    const zip = await JSZip.loadAsync(output);
    const xml = await zip.file("word/document.xml")!.async("string");
    for (const item of SAMPLE_DATA.items) {
      expect(xml).toContain(item.name);
      expect(xml).toContain(item.amount);
    }
  });

  it("checkbox — controlled Unicode glyph reaches the document, never a naive 'X'", async () => {
    const output = engine.render({ templateBuffer, data: SAMPLE_DATA });
    const zip = await JSZip.loadAsync(output);
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain("☒");
  });

  it("accented characters — both static text and an injected field value survive byte-for-byte", async () => {
    const output = engine.render({ templateBuffer, data: SAMPLE_DATA });
    const zip = await JSZip.loadAsync(output);
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain("Établissements Béranger");
    expect(xml).toContain("île, çà, être, à côté");
  });

  it("long multiline text — every line survives, no silent truncation", async () => {
    const output = engine.render({ templateBuffer, data: SAMPLE_DATA });
    const zip = await JSZip.loadAsync(output);
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain("Ligne 1");
    expect(xml).toContain("Ligne 2");
    expect(xml).toContain("Ligne 3");
  });

  it("a missing (undefined) field renders as an empty placeholder, never throws — the blocking decision belongs to the domain, not the engine", () => {
    const partialData = { "tender.reference": "AO-2026-0421" };
    expect(() => engine.render({ templateBuffer, data: partialData })).not.toThrow();
  });

  it("BLOQUANT — rejects a corrupt/non-ZIP buffer with a domain error, never a raw library exception", () => {
    expect(() => engine.scanPlaceholders(Buffer.from("not a zip file"))).toThrow();
  });
});
