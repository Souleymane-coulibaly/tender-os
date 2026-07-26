import { Injectable } from "@nestjs/common";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import { dirname, join, normalize, relative, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import { getRequiredEnv } from "../../../shared-kernel/env";
import type { StorageProvider } from "../application/ports/storage-provider";

/**
 * Adaptateur de développement/tests (conception §L) — répertoire configurable via
 * `DOCUMENT_LOCAL_STORAGE_PATH`. Ne fournit pas `generateSignedUrl` (capacité optionnelle du
 * port, réservée à un futur adaptateur Cloudflare R2).
 */
@Injectable()
export class LocalFilesystemStorageProvider implements StorageProvider {
  private readonly basePath: string;

  constructor() {
    this.basePath = resolve(getRequiredEnv("DOCUMENT_LOCAL_STORAGE_PATH"));
  }

  private resolveKey(key: string): string {
    const target = resolve(join(this.basePath, normalize(key)));
    const relativePath = relative(this.basePath, target);
    // Defense-in-depth : la storageKey est toujours générée côté serveur (jamais dérivée d'un
    // nom de fichier utilisateur), mais on refuse explicitement toute tentative de sortir du
    // répertoire de stockage (conception §22, protection contre le path traversal).
    if (relativePath.startsWith("..") || resolve(target) !== target) {
      throw new Error(`Refusing to resolve storage key outside of the storage root: "${key}"`);
    }
    return target;
  }

  async put(input: { key: string; content: Readable; contentType: string; sizeBytes: number }): Promise<void> {
    const filePath = this.resolveKey(input.key);
    await mkdir(dirname(filePath), { recursive: true });
    await pipeline(input.content, createWriteStream(filePath));
  }

  async openReadStream(key: string): Promise<Readable> {
    const filePath = this.resolveKey(key);
    return createReadStream(filePath);
  }

  async delete(key: string): Promise<void> {
    const filePath = this.resolveKey(key);
    await rm(filePath, { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.resolveKey(key));
      return true;
    } catch {
      return false;
    }
  }

  async getMetadata(key: string): Promise<{ sizeBytes: number; contentType: string } | null> {
    try {
      const stats = await stat(this.resolveKey(key));
      return { sizeBytes: stats.size, contentType: "application/octet-stream" };
    } catch {
      return null;
    }
  }
}
