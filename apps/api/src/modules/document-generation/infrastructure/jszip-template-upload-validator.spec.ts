import { readFileSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { InvalidTemplateFileError } from "../domain/errors";
import { assertSafeEntryPath, JszipTemplateUploadValidator } from "./jszip-template-upload-validator";

const FIXTURE_PATH = join(__dirname, "..", "test-support", "fixtures", "demo-template.docx");
const OOXML_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

async function buildMinimalOoxmlZip(overrides?: { extraFile?: { name: string; content: string } }): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", "<Types/>");
  zip.file("word/document.xml", "<w:document/>");
  if (overrides?.extraFile) {
    zip.file(overrides.extraFile.name, overrides.extraFile.content);
  }
  return zip.generateAsync({ type: "nodebuffer" });
}

/** `InvalidTemplateFileError.message` reste volontairement générique côté HTTP (mission "jamais
 *  une fuite du détail technique de l'attaque détectée au client") — le détail vérifiable par les
 *  tests vit dans `.reason` (log serveur uniquement). */
async function expectRejectionReason(promise: Promise<unknown>, pattern: RegExp): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(InvalidTemplateFileError);
  try {
    await promise;
    throw new Error("expected promise to reject");
  } catch (error) {
    expect(error).toBeInstanceOf(InvalidTemplateFileError);
    expect((error as InstanceType<typeof InvalidTemplateFileError>).reason).toMatch(pattern);
  }
}

describe("JszipTemplateUploadValidator (real ZIP/DOCX security checks)", () => {
  const validator = new JszipTemplateUploadValidator();

  it("accepts a genuine .docx template", async () => {
    const buffer = readFileSync(FIXTURE_PATH);
    await expect(validator.validate({ buffer, originalFilename: "demo-template.docx", mimeType: OOXML_MIME })).resolves.toBeUndefined();
  });

  it("BLOQUANT — rejects an empty file", async () => {
    await expectRejectionReason(validator.validate({ buffer: Buffer.alloc(0), originalFilename: "empty.docx", mimeType: OOXML_MIME }), /empty/);
  });

  it("BLOQUANT — rejects a file exceeding the maximum size", async () => {
    const buffer = Buffer.alloc(21 * 1024 * 1024);
    await expectRejectionReason(validator.validate({ buffer, originalFilename: "huge.docx", mimeType: OOXML_MIME }), /size/);
  });

  it("BLOQUANT — rejects a .docm (macro-enabled) file even if declared as a normal .docx MIME type", async () => {
    const buffer = await buildMinimalOoxmlZip();
    await expectRejectionReason(validator.validate({ buffer, originalFilename: "malicious.docm", mimeType: OOXML_MIME }), /macro-enabled/);
  });

  it("BLOQUANT — rejects a macro-enabled MIME type even with a .docx extension", async () => {
    const buffer = await buildMinimalOoxmlZip();
    await expectRejectionReason(
      validator.validate({ buffer, originalFilename: "renamed.docx", mimeType: "application/vnd.ms-word.document.macroEnabled.12" }),
      /macro-enabled/,
    );
  });

  it("BLOQUANT — rejects a mismatched extension/MIME combination", async () => {
    const buffer = await buildMinimalOoxmlZip();
    await expectRejectionReason(validator.validate({ buffer, originalFilename: "template.pdf", mimeType: OOXML_MIME }), /only \.docx/);
  });

  it("BLOQUANT — rejects a corrupt (non-ZIP) buffer", async () => {
    const buffer = Buffer.from("this is not a zip file at all");
    await expectRejectionReason(validator.validate({ buffer, originalFilename: "corrupt.docx", mimeType: OOXML_MIME }), /ZIP/);
  });

  it("BLOQUANT — rejects a zip missing the required OOXML structure (not a real Word document)", async () => {
    const zip = new JSZip();
    zip.file("just-some-file.txt", "hello");
    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    await expectRejectionReason(validator.validate({ buffer, originalFilename: "fake.docx", mimeType: OOXML_MIME }), /OOXML entry/);
  });

  it("BLOQUANT — XXE proof: rejects a template whose XML entries declare a DOCTYPE/ENTITY, never present in a genuine Word document", async () => {
    const buffer = await buildMinimalOoxmlZip({
      extraFile: {
        name: "word/_rels/document.xml.rels",
        content: '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><Relationships>&xxe;</Relationships>',
      },
    });
    await expectRejectionReason(validator.validate({ buffer, originalFilename: "xxe.docx", mimeType: OOXML_MIME }), /XXE/);
  });

  it("BLOQUANT — zip-bomb proof: rejects an archive declaring an excessive number of entries", async () => {
    const zip = new JSZip();
    zip.file("[Content_Types].xml", "<Types/>");
    zip.file("word/document.xml", "<w:document/>");
    for (let i = 0; i < 2_100; i += 1) {
      zip.file(`word/junk-${i}.xml`, "x");
    }
    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    await expectRejectionReason(validator.validate({ buffer, originalFilename: "bomb.docx", mimeType: OOXML_MIME }), /entries/);
  });
});

/**
 * `assertSafeEntryPath` testée directement en isolation : la bibliothèque `jszip` normalise
 * elle-même les segments ".." lors de la CRÉATION d'une archive (impossible d'y faire passer un nom
 * d'entrée littéralement malveillant via son API haut niveau), donc un test bout-en-bout via
 * `JszipTemplateUploadValidator.validate` ne pourrait jamais reproduire un fichier ZIP forgé par un
 * outil tiers (ex. `zipfile` Python, édition manuelle du répertoire central) contenant un nom
 * d'entrée brut avec "..". Cette fonction reste la barrière RÉELLE contre un tel fichier — testée
 * directement pour prouver qu'elle rejette bien tous les cas connus de path-traversal ZIP.
 */
describe("assertSafeEntryPath", () => {
  it("rejects a relative path-traversal segment", () => {
    expect(() => assertSafeEntryPath("../../../etc/evil.xml")).toThrow(InvalidTemplateFileError);
    expect(() => assertSafeEntryPath("word/../../evil.xml")).toThrow(InvalidTemplateFileError);
  });

  it("rejects a Windows-style path-traversal segment", () => {
    expect(() => assertSafeEntryPath("word\\..\\..\\evil.xml")).toThrow(InvalidTemplateFileError);
  });

  it("rejects an absolute path", () => {
    expect(() => assertSafeEntryPath("/etc/evil.xml")).toThrow(InvalidTemplateFileError);
  });

  it("accepts a normal, contained OOXML entry path", () => {
    expect(() => assertSafeEntryPath("word/document.xml")).not.toThrow();
    expect(() => assertSafeEntryPath("[Content_Types].xml")).not.toThrow();
  });
});
