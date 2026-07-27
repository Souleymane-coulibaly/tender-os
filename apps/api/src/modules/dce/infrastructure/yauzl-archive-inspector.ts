import { Injectable } from "@nestjs/common";
import * as yauzl from "yauzl";
import { ZipSecurityViolationError } from "../domain/errors";
import type { ZipArchiveInspector, ZipExtractedEntry, ZipImportLimits } from "../application/ports/zip-archive-inspector";

const UNIX_FILE_TYPE_MASK = 0xf000;
const UNIX_SYMLINK_TYPE = 0xa000;

/** Un dossier dans une archive ZIP est une entrée dont le nom se termine par "/" — jamais un
 *  fichier à extraire, jamais compté dans les limites de taille (mission §"sécurité ZIP"). */
function isDirectoryEntry(entry: yauzl.Entry): boolean {
  return entry.fileName.endsWith("/");
}

/** Le mode Unix (symlink, fichier, dossier) est encodé dans les 16 bits de poids fort de
 *  `externalFileAttributes` lorsque l'archive a été produite sous Unix (versionMadeBy host OS).
 *  Une archive produite sous Windows n'encode jamais ce bit — `externalFileAttributes` vaut alors
 *  0 pour ce champ, ce qui ne matche jamais UNIX_SYMLINK_TYPE : aucun faux positif possible. */
function isSymlinkEntry(entry: yauzl.Entry): boolean {
  return ((entry.externalFileAttributes >>> 16) & UNIX_FILE_TYPE_MASK) === UNIX_SYMLINK_TYPE;
}

async function readEntryBuffer(zipfile: yauzl.ZipFile, entry: yauzl.Entry): Promise<Buffer> {
  const stream = await zipfile.openReadStreamPromise(entry);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

/**
 * Implémentation durcie (mission Sprint 1 §"sécurité ZIP obligatoire") : une PREMIÈRE passe lit
 * uniquement les métadonnées du central directory (nom, taille compressée/décompressée
 * déclarées) pour TOUTES les entrées et applique la totalité des contrôles de sécurité — aucun
 * octet n'est décompressé pendant cette passe. La décompression réelle (deuxième passe) ne
 * démarre qu'une fois l'archive entière jugée sûre ; toute violation rejette l'archive complète
 * via `ZipSecurityViolationError`, avant même d'avoir ouvert un seul flux de lecture.
 *
 * Path traversal / chemin absolu : yauzl valide déjà nativement chaque `fileName` (voir
 * `validateFileName` dans la librairie — rejette `..`, chemins commençant par `/` ou `X:`, et
 * les antislashs) et émet une erreur sur le zipfile, capturée ci-dessous et traduite en
 * `ZipSecurityViolationError` — ce n'est pas dupliqué ici, seul le lien de symbole (non couvert
 * par yauzl) est vérifié explicitement.
 */
@Injectable()
export class YauzlArchiveInspector implements ZipArchiveInspector {
  async extract(input: { buffer: Buffer; limits: ZipImportLimits }): Promise<ZipExtractedEntry[]> {
    const { buffer, limits } = input;

    let zipfile: yauzl.ZipFile;
    try {
      zipfile = await yauzl.fromBufferPromise(buffer, { lazyEntries: true, strictFileNames: true });
    } catch {
      throw new ZipSecurityViolationError({ reason: "the archive is not a valid ZIP file" });
    }

    if (zipfile.entryCount > limits.maxEntries) {
      zipfile.close();
      throw new ZipSecurityViolationError({
        reason: `too many entries (${zipfile.entryCount}, maximum ${limits.maxEntries})`,
      });
    }

    const fileEntries: yauzl.Entry[] = [];
    let totalUncompressedBytes = 0;

    try {
      for await (const entry of zipfile.eachEntry()) {
        if (isDirectoryEntry(entry)) {
          continue;
        }
        if (isSymlinkEntry(entry)) {
          throw new ZipSecurityViolationError({ reason: `symbolic link entry rejected: ${entry.fileName}` });
        }
        if (entry.uncompressedSize > limits.maxSingleEntryUncompressedBytes) {
          throw new ZipSecurityViolationError({
            reason: `entry too large once decompressed: ${entry.fileName}`,
          });
        }

        totalUncompressedBytes += entry.uncompressedSize;
        if (totalUncompressedBytes > limits.maxTotalUncompressedBytes) {
          throw new ZipSecurityViolationError({
            reason: `total decompressed size exceeds the allowed limit (${limits.maxTotalUncompressedBytes} bytes)`,
          });
        }

        // Ratio non pertinent pour une entrée quasi vide (évite une division par une valeur
        // proche de zéro qui ferait exploser artificiellement le ratio d'un fichier minuscule).
        if (entry.compressedSize > 0) {
          const ratio = entry.uncompressedSize / entry.compressedSize;
          if (ratio > limits.maxCompressionRatio) {
            throw new ZipSecurityViolationError({
              reason: `suspicious compression ratio for entry: ${entry.fileName}`,
            });
          }
        }

        fileEntries.push(entry);
      }
    } catch (error) {
      zipfile.close();
      if (error instanceof ZipSecurityViolationError) {
        throw error;
      }
      throw new ZipSecurityViolationError({ reason: (error as Error).message });
    }

    try {
      const extracted: ZipExtractedEntry[] = [];
      for (const entry of fileEntries) {
        const entryBuffer = await readEntryBuffer(zipfile, entry);
        extracted.push({ entryName: entry.fileName, buffer: entryBuffer });
      }
      return extracted;
    } finally {
      zipfile.close();
    }
  }
}
