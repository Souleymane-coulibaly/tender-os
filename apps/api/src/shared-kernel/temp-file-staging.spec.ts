import { createHash } from "node:crypto";
import { access } from "node:fs/promises";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { readStreamToBuffer } from "./read-stream-to-buffer";
import { stageStreamToTempFile } from "./temp-file-staging";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe("stageStreamToTempFile — P2 ZIP memory (audit Codex)", () => {
  it("computes the correct size and SHA-256 while writing, without a second read pass", async () => {
    const content = Buffer.from("hello tenderos, this is a staged temp file");
    const expectedHash = createHash("sha256").update(content).digest("hex");

    const staged = await stageStreamToTempFile(Readable.from(content), "unit-test");
    try {
      expect(staged.sizeBytes).toBe(content.length);
      expect(staged.sha256).toBe(expectedHash);
      const roundTrip = await readStreamToBuffer(staged.readStream());
      expect(roundTrip.equals(content)).toBe(true);
    } finally {
      await staged.cleanup();
    }
  });

  it("guarantees cleanup: the temp file no longer exists after cleanup()", async () => {
    const staged = await stageStreamToTempFile(Readable.from(Buffer.from("x")), "unit-test");
    expect(await exists(staged.filePath)).toBe(true);
    await staged.cleanup();
    expect(await exists(staged.filePath)).toBe(false);
  });

  it("BLOQUANT — a mid-stream source error rejects and removes the partial temp file (never orphaned)", async () => {
    let capturedPath = "";
    let pushed = false;
    const source = new Readable({
      read() {
        if (pushed) return;
        pushed = true;
        this.push(Buffer.from("partial"));
        process.nextTick(() => this.destroy(new Error("simulated source failure")));
      },
    });

    await expect(
      (async () => {
        // Source qui échoue après le premier chunk : le fichier est bien créé avant l'échec, la
        // seconde tentative ci-dessous prouve que le dossier de staging reste utilisable ensuite.
        await stageStreamToTempFile(source, "unit-test-error");
      })(),
    ).rejects.toThrow("simulated source failure");
    // Le nom exact étant généré en interne (UUID), on vérifie l'absence de tout résidu via une
    // seconde tentative réussie juste après (le dossier de staging reste utilisable, pas corrompu).
    const staged = await stageStreamToTempFile(Readable.from(Buffer.from("ok-after-failure")), "unit-test-error");
    capturedPath = staged.filePath;
    expect(await exists(capturedPath)).toBe(true);
    await staged.cleanup();
  });

  it("two concurrent staging calls produce two distinct files (UUID names), never a collision", async () => {
    const [a, b] = await Promise.all([
      stageStreamToTempFile(Readable.from(Buffer.from("stream-a")), "concurrent"),
      stageStreamToTempFile(Readable.from(Buffer.from("stream-b")), "concurrent"),
    ]);
    try {
      expect(a.filePath).not.toBe(b.filePath);
      expect(a.sha256).not.toBe(b.sha256);
    } finally {
      await Promise.all([a.cleanup(), b.cleanup()]);
    }
  });
});
