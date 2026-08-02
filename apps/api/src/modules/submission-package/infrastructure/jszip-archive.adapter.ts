import { Injectable } from "@nestjs/common";
import JSZip from "jszip";
import type { ZipArchivePort, ZipEntry } from "../application/ports/zip-archive.port";
import { assertArchivePathIsContained } from "../domain/archive-path-safety";

/**
 * Mission Sprint 8A bis §52/§54 — construction RÉELLE d'une archive ZIP (jamais une simulation).
 * `assertArchivePathIsContained` est une seconde barrière défensive contre le zip-slip, même si
 * chaque `archivePath` a déjà été validé par `buildSafeArchivePath`/`PackageFile.create` en amont.
 */
@Injectable()
export class JszipArchiveAdapter implements ZipArchivePort {
  async build(entries: readonly ZipEntry[]): Promise<Buffer> {
    const zip = new JSZip();
    for (const entry of entries) {
      assertArchivePathIsContained(entry.archivePath);
      zip.file(entry.archivePath, entry.content);
    }
    return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  }
}
