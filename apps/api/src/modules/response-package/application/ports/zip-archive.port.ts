import type { Readable } from "node:stream";

export type ZipEntry = Readonly<{ archivePath: string; content: Readable }>;

/** Même discipline que `DocumentRendererPort`/`submission-package`'s `ZipArchivePort` — l'application
 *  ne dépend jamais directement d'une bibliothèque ZIP concrète, seule l'infrastructure sait
 *  qu'elle utilise `jszip`. P2 (audit Codex, ZIP memory) — `content` est un flux (jamais un
 *  `Buffer` complet) et `buildStream` retourne un flux ZIP progressif, jamais un `Buffer` unique
 *  contenant l'archive entière. */
export interface ZipArchivePort {
  buildStream(entries: readonly ZipEntry[]): NodeJS.ReadableStream;
}

export const ZIP_ARCHIVE_PORT = Symbol("RESPONSE_PACKAGE_ZIP_ARCHIVE_PORT");
