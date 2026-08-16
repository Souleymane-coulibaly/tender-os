import type { Readable } from "node:stream";

export type ZipEntry = Readonly<{ archivePath: string; content: Readable }>;

/**
 * Mission Sprint 8A bis §52/§54 — l'application ne dépend JAMAIS directement d'une bibliothèque
 * ZIP concrète (même discipline que `DocumentRendererPort`/`PdfRendererPort` pour Export) : seule
 * l'infrastructure sait qu'elle utilise `jszip`. P2 (audit Codex, ZIP memory) — `content` est un
 * flux (jamais un `Buffer` complet) et `buildStream` retourne un flux ZIP progressif, jamais un
 * `Buffer` unique contenant l'archive entière.
 */
export interface ZipArchivePort {
  buildStream(entries: readonly ZipEntry[]): NodeJS.ReadableStream;
}

export const ZIP_ARCHIVE_PORT = Symbol("ZIP_ARCHIVE_PORT");
