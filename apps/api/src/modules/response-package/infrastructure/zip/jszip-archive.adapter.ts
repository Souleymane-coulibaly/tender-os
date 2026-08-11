import { Injectable } from "@nestjs/common";
import JSZip from "jszip";
import { assertArchivePathIsContained } from "../../domain/archive-path-safety";
import { DuplicateArchivePathError } from "../../domain/errors";
import type { ZipArchivePort, ZipEntry } from "../../application/ports/zip-archive.port";

/** Construction RÉELLE d'une archive ZIP (jamais une simulation) — même technique que
 *  `submission-package/infrastructure/jszip-archive.adapter.ts` (Sprint 8A bis §52/§54), copiée
 *  volontairement pour ce module (décision utilisateur Sprint 14). */
@Injectable()
export class JszipArchiveAdapter implements ZipArchivePort {
  async build(entries: readonly ZipEntry[]): Promise<Buffer> {
    const zip = new JSZip();
    const seenPaths = new Set<string>();
    for (const entry of entries) {
      assertArchivePathIsContained(entry.archivePath);
      // Mission §58 — pas d'écrasement silencieux : deux entrées avec le même chemin dans
      // l'archive ne devraient structurellement jamais arriver (chaque chemin est dérivé de
      // l'id de la pièce), mais reste une seconde barrière défensive explicite.
      if (seenPaths.has(entry.archivePath)) {
        throw new DuplicateArchivePathError(entry.archivePath);
      }
      seenPaths.add(entry.archivePath);
      zip.file(entry.archivePath, entry.content);
    }
    return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  }
}
