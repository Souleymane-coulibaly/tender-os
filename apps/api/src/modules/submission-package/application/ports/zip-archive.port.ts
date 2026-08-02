export type ZipEntry = Readonly<{ archivePath: string; content: Buffer }>;

/**
 * Mission Sprint 8A bis §52/§54 — l'application ne dépend JAMAIS directement d'une bibliothèque
 * ZIP concrète (même discipline que `DocumentRendererPort`/`PdfRendererPort` pour Export) : seule
 * l'infrastructure sait qu'elle utilise `jszip`.
 */
export interface ZipArchivePort {
  build(entries: readonly ZipEntry[]): Promise<Buffer>;
}

export const ZIP_ARCHIVE_PORT = Symbol("ZIP_ARCHIVE_PORT");
