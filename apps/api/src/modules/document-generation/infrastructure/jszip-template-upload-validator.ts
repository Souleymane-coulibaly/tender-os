import { Injectable } from "@nestjs/common";
import JSZip from "jszip";
import { InvalidTemplateFileError } from "../domain/errors";
import type { TemplateUploadValidator } from "../application/ports/template-upload-validator";

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 Mo — un formulaire administratif réel tient largement en dessous.
const MAX_ZIP_ENTRIES = 2_000;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 200 * 1024 * 1024; // 200 Mo cumulés déclarés — défense zip-bomb.
const MAX_COMPRESSION_RATIO = 200; // uncompressed / compressed — un ratio extrême trahit une bombe zip.
const REQUIRED_OOXML_ENTRIES = ["[Content_Types].xml", "word/document.xml"];
const XML_ENTRIES_TO_SCAN_FOR_XXE = /\.(xml|rels)$/i;
const XXE_SIGNATURE = /<!DOCTYPE|<!ENTITY/i;

const ALLOWED_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const REJECTED_MACRO_MIME_TYPES = ["application/vnd.ms-word.document.macroEnabled.12", "application/vnd.ms-word.template.macroEnabled.12"];

export function assertSafeEntryPath(entryName: string): void {
  if (entryName.startsWith("/") || entryName.startsWith("\\")) {
    throw new InvalidTemplateFileError(`zip entry uses an absolute path: ${entryName}`);
  }
  const segments = entryName.split(/[/\\]/);
  if (segments.some((segment) => segment === "..")) {
    throw new InvalidTemplateFileError(`zip entry attempts path traversal: ${entryName}`);
  }
}

/**
 * Implémentation `jszip` du port `TemplateUploadValidator` (mission §"sécurité upload de
 * template"). Défense en profondeur, dans l'ordre : taille du fichier, extension/MIME
 * (`.docm`/macro explicitement rejetés même si l'extension déclarée est `.docx`), intégrité ZIP,
 * nombre d'entrées et taille décompressée cumulée déclarée + ratio de compression par entrée
 * (zip-bomb), chemins d'entrée (path-traversal), présence de la structure OOXML minimale, et enfin
 * absence de déclaration `<!DOCTYPE`/`<!ENTITY` dans les fichiers XML/rels réels (XXE) — un document
 * Word authentique n'en contient jamais.
 */
@Injectable()
export class JszipTemplateUploadValidator implements TemplateUploadValidator {
  async validate(input: { buffer: Buffer; originalFilename: string; mimeType: string }): Promise<void> {
    if (input.buffer.length === 0) {
      throw new InvalidTemplateFileError("file is empty");
    }
    if (input.buffer.length > MAX_FILE_SIZE_BYTES) {
      throw new InvalidTemplateFileError(`file exceeds the maximum allowed size of ${MAX_FILE_SIZE_BYTES} bytes`);
    }

    const extension = input.originalFilename.toLowerCase().split(".").pop() ?? "";
    if (extension === "docm" || REJECTED_MACRO_MIME_TYPES.includes(input.mimeType)) {
      throw new InvalidTemplateFileError("macro-enabled Word documents (.docm) are never accepted as templates");
    }
    if (extension !== "docx" || input.mimeType !== ALLOWED_MIME_TYPE) {
      throw new InvalidTemplateFileError(`only .docx (${ALLOWED_MIME_TYPE}) files are accepted as templates`);
    }

    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(input.buffer);
    } catch (error) {
      throw new InvalidTemplateFileError(`not a valid ZIP/DOCX container: ${error instanceof Error ? error.message : String(error)}`);
    }

    const entries = Object.values(zip.files).filter((entry) => !entry.dir);
    if (entries.length > MAX_ZIP_ENTRIES) {
      throw new InvalidTemplateFileError(`zip contains too many entries (${entries.length} > ${MAX_ZIP_ENTRIES})`);
    }

    let totalDeclaredUncompressedBytes = 0;
    for (const entry of entries) {
      assertSafeEntryPath(entry.name);

      // `_data` porte les métadonnées du répertoire central ZIP, lues AVANT toute décompression
      // réelle — première barrière zip-bomb, jamais une décompression aveugle intégrale.
      const meta = (entry as unknown as { _data?: { uncompressedSize?: number; compressedSize?: number } })._data;
      const uncompressedSize = meta?.uncompressedSize ?? 0;
      const compressedSize = meta?.compressedSize ?? 0;
      totalDeclaredUncompressedBytes += uncompressedSize;

      if (compressedSize > 0 && uncompressedSize / compressedSize > MAX_COMPRESSION_RATIO) {
        throw new InvalidTemplateFileError(`zip entry "${entry.name}" has a suspicious compression ratio (possible zip bomb)`);
      }
    }
    if (totalDeclaredUncompressedBytes > MAX_TOTAL_UNCOMPRESSED_BYTES) {
      throw new InvalidTemplateFileError(`zip declares more than ${MAX_TOTAL_UNCOMPRESSED_BYTES} uncompressed bytes in total (possible zip bomb)`);
    }

    const entryNames = new Set(entries.map((entry) => entry.name));
    for (const required of REQUIRED_OOXML_ENTRIES) {
      if (!entryNames.has(required)) {
        throw new InvalidTemplateFileError(`missing required OOXML entry: ${required}`);
      }
    }

    for (const entry of entries) {
      if (!XML_ENTRIES_TO_SCAN_FOR_XXE.test(entry.name)) continue;
      const text = await entry.async("string");
      if (XXE_SIGNATURE.test(text)) {
        throw new InvalidTemplateFileError(`entry "${entry.name}" contains a DOCTYPE/ENTITY declaration, never present in a genuine Word document (possible XXE payload)`);
      }
    }
  }
}
