export type ZipEntry = Readonly<{ archivePath: string; content: Buffer }>;

/** Même discipline que `DocumentRendererPort`/`submission-package`'s `ZipArchivePort` — l'application
 *  ne dépend jamais directement d'une bibliothèque ZIP concrète, seule l'infrastructure sait
 *  qu'elle utilise `jszip`. */
export interface ZipArchivePort {
  build(entries: readonly ZipEntry[]): Promise<Buffer>;
}

export const ZIP_ARCHIVE_PORT = Symbol("RESPONSE_PACKAGE_ZIP_ARCHIVE_PORT");
