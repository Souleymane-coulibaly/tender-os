import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import type { StorageProvider } from "../application/ports/storage-provider";

/**
 * Mission §26.X.13 — suite de contract tests partagée, exécutée contre CHAQUE implémentation
 * réelle de `StorageProvider` (locale et Cloudflare R2) pour prouver qu'elles respectent le même
 * comportement observable. N'est PAS un fichier `*.spec.ts` (jamais collecté directement par
 * vitest) — appelée depuis les specs d'intégration de chaque adaptateur, qui fournissent leur
 * propre provider et leur propre nettoyage. La vérification "protection contre le path traversal"
 * reste hors de cette suite : c'est un mécanisme de défense en profondeur propre au système de
 * fichiers local (une clé S3/R2 n'a pas de notion de répertoire à "sortir"), déjà testée
 * séparément dans `local-filesystem-storage.provider.integration.spec.ts`.
 */
export function runStorageProviderContractTests(
  label: string,
  setup: () => Promise<{ provider: StorageProvider; cleanup: () => Promise<void> }>,
): void {
  describe(`StorageProvider contract — ${label}`, () => {
    it("writes and reads back an object", async () => {
      const { provider, cleanup } = await setup();
      try {
        const key = `contract-test/${label}/round-trip.txt`;
        await provider.put({ key, content: Readable.from(Buffer.from("hello world")), contentType: "text/plain", sizeBytes: 11 });

        const stream = await provider.openReadStream(key);
        const chunks: Buffer[] = [];
        for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        expect(Buffer.concat(chunks).toString()).toBe("hello world");
      } finally {
        await cleanup();
      }
    });

    it("reports existence correctly before and after deletion", async () => {
      const { provider, cleanup } = await setup();
      try {
        const key = `contract-test/${label}/exists-lifecycle.txt`;
        expect(await provider.exists(key)).toBe(false);

        await provider.put({ key, content: Readable.from(Buffer.from("x")), contentType: "text/plain", sizeBytes: 1 });
        expect(await provider.exists(key)).toBe(true);

        await provider.delete(key);
        expect(await provider.exists(key)).toBe(false);
      } finally {
        await cleanup();
      }
    });

    it("returns metadata (size) for a stored object", async () => {
      const { provider, cleanup } = await setup();
      try {
        const key = `contract-test/${label}/metadata.txt`;
        await provider.put({ key, content: Readable.from(Buffer.from("12345")), contentType: "text/plain", sizeBytes: 5 });

        const metadata = await provider.getMetadata(key);
        expect(metadata?.sizeBytes).toBe(5);
      } finally {
        await cleanup();
      }
    });

    it("returns null metadata for a missing object", async () => {
      const { provider, cleanup } = await setup();
      try {
        expect(await provider.getMetadata(`contract-test/${label}/does-not-exist.pdf`)).toBeNull();
      } finally {
        await cleanup();
      }
    });
  });
}
