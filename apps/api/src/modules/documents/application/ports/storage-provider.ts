import type { Readable } from "node:stream";

/**
 * Abstraction de stockage (conception §L) — le Domain et l'Application ne dépendent que de
 * cette interface, jamais d'un SDK concret (S3, R2) ni du système de fichiers Node. `Readable`
 * est un type générique du runtime Node, pas une dépendance à `fs` : n'importe quelle
 * implémentation (mémoire, réseau, disque) peut le satisfaire.
 */
export interface StorageProvider {
  put(input: { key: string; content: Readable; contentType: string; sizeBytes: number }): Promise<void>;
  openReadStream(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  getMetadata(key: string): Promise<{ sizeBytes: number; contentType: string } | null>;
  /** Capacité optionnelle — non implémentée par l'adaptateur local V1, prête pour un futur
   *  adaptateur Cloudflare R2 (conception §L). */
  generateSignedUrl?(key: string, expiresInSeconds: number): Promise<string>;
}

export const STORAGE_PROVIDER = Symbol("STORAGE_PROVIDER");

/** Résultat retourné par DownloadDocumentVersion — jamais persisté (conception §D, VO résultat). */
export type DocumentDownload =
  | { kind: "stream"; stream: Readable; contentType: string; filename: string; sizeBytes: number }
  | { kind: "redirect"; url: string; expiresAt: Date };
