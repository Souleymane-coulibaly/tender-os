import { Injectable } from "@nestjs/common";
import JSZip from "jszip";
import type { ZipArchivePort, ZipEntry } from "../application/ports/zip-archive.port";
import { assertArchivePathIsContained } from "../domain/archive-path-safety";

/**
 * Mission Sprint 8A bis §52/§54 — construction RÉELLE d'une archive ZIP (jamais une simulation).
 * `assertArchivePathIsContained` est une seconde barrière défensive contre le zip-slip, même si
 * chaque `archivePath` a déjà été validé par `buildSafeArchivePath`/`PackageFile.create` en amont.
 * P2 (audit Codex, ZIP memory) — chaque entrée est ajoutée comme flux (jamais bufferisée), et
 * `generateNodeStream` avec `streamFiles: true` génère l'archive progressivement au lieu de tout
 * construire en un seul `Buffer` en mémoire.
 */
@Injectable()
export class JszipArchiveAdapter implements ZipArchivePort {
  buildStream(entries: readonly ZipEntry[]): NodeJS.ReadableStream {
    const zip = new JSZip();
    for (const entry of entries) {
      assertArchivePathIsContained(entry.archivePath);
      zip.file(entry.archivePath, entry.content);
    }
    return zip.generateNodeStream({ type: "nodebuffer", streamFiles: true, compression: "DEFLATE" });
  }
}
