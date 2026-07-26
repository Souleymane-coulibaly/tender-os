import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LocalFilesystemStorageProvider } from "./local-filesystem-storage.provider";

describe("LocalFilesystemStorageProvider", () => {
  const testRoot = join(process.cwd(), ".local-storage", `test-${randomUUID()}`);
  let provider: LocalFilesystemStorageProvider;

  beforeAll(() => {
    process.env.DOCUMENT_LOCAL_STORAGE_PATH = testRoot;
    provider = new LocalFilesystemStorageProvider();
  });

  afterAll(async () => {
    await rm(testRoot, { recursive: true, force: true });
  });

  it("writes and reads back a file", async () => {
    const key = "org-1/doc-1/version-1.pdf";
    await provider.put({ key, content: Readable.from(Buffer.from("hello world")), contentType: "application/pdf", sizeBytes: 11 });

    const stream = await provider.openReadStream(key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString()).toBe("hello world");
  });

  it("reports existence correctly before and after deletion", async () => {
    const key = "org-1/doc-2/version-1.txt";
    expect(await provider.exists(key)).toBe(false);

    await provider.put({ key, content: Readable.from(Buffer.from("x")), contentType: "text/plain", sizeBytes: 1 });
    expect(await provider.exists(key)).toBe(true);

    await provider.delete(key);
    expect(await provider.exists(key)).toBe(false);
  });

  it("returns metadata (size) for a stored object", async () => {
    const key = "org-1/doc-3/version-1.txt";
    await provider.put({ key, content: Readable.from(Buffer.from("12345")), contentType: "text/plain", sizeBytes: 5 });

    const metadata = await provider.getMetadata(key);
    expect(metadata?.sizeBytes).toBe(5);
  });

  it("returns null metadata for a missing object", async () => {
    expect(await provider.getMetadata("org-1/does-not-exist.pdf")).toBeNull();
  });

  it("refuses to resolve a key that attempts to escape the storage root (path traversal)", async () => {
    await expect(
      provider.put({
        key: "../../../etc/passwd",
        content: Readable.from(Buffer.from("x")),
        contentType: "text/plain",
        sizeBytes: 1,
      }),
    ).rejects.toThrow(/outside of the storage root/);
  });
});
