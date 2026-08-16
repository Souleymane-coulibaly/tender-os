import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { runStorageProviderContractTests } from "../test-support/storage-provider.contract-tests";
import { LocalFilesystemStorageProvider } from "./local-filesystem-storage.provider";

runStorageProviderContractTests("local", async () => {
  const testRoot = join(process.cwd(), ".local-storage", `test-${randomUUID()}`);
  process.env.DOCUMENT_LOCAL_STORAGE_PATH = testRoot;
  const provider = new LocalFilesystemStorageProvider();
  return { provider, cleanup: () => rm(testRoot, { recursive: true, force: true }) };
});

describe("LocalFilesystemStorageProvider — path traversal (filesystem-specific, not part of the shared contract)", () => {
  it("refuses to resolve a key that attempts to escape the storage root", async () => {
    const testRoot = join(process.cwd(), ".local-storage", `test-${randomUUID()}`);
    process.env.DOCUMENT_LOCAL_STORAGE_PATH = testRoot;
    const provider = new LocalFilesystemStorageProvider();

    try {
      await expect(
        provider.put({
          key: "../../../etc/passwd",
          content: Readable.from(Buffer.from("x")),
          contentType: "text/plain",
          sizeBytes: 1,
        }),
      ).rejects.toThrow(/outside of the storage root/);
    } finally {
      await rm(testRoot, { recursive: true, force: true });
    }
  });
});
