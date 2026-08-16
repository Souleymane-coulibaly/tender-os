import { PassThrough, Readable } from "node:stream";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { readStreamToBuffer } from "../../../shared-kernel/read-stream-to-buffer";
import { buildSafeArchivePath } from "../domain/archive-path-safety";
import { UnsafeArchivePathError } from "../domain/errors";
import { JszipArchiveAdapter } from "./jszip-archive.adapter";

/** Le flux `NodeJS.ReadableStream` retourné par `generateNodeStream()` n'implémente pas
 *  `Symbol.asyncIterator` (contrairement à `stream.Readable`) — on le fait transiter par un
 *  `PassThrough` (un vrai `Readable`) avant de le drainer, exactement comme `stageStreamToTempFile`
 *  le consomme en production via `pipeline()` (qui, lui, ne dépend pas de l'itération async). */
function toRealReadable(stream: NodeJS.ReadableStream): Readable {
  const passThrough = new PassThrough();
  stream.pipe(passThrough);
  return passThrough;
}

describe("buildSafeArchivePath — mission Sprint 8A §52/§54 zip-slip protection", () => {
  it("BLOQUANT — rejects path traversal segments (..)", () => {
    expect(() => buildSafeArchivePath(["..", "etc", "passwd"])).toThrow(UnsafeArchivePathError);
  });

  it("builds a normal safe path", () => {
    expect(buildSafeArchivePath(["sources", "DC1.pdf"])).toBe("sources/DC1.pdf");
  });
});

describe("JszipArchiveAdapter — real ZIP build (streaming), P2 audit Codex ZIP memory", () => {
  it("BLOQUANT — rejects an unsafe archive path before generating anything", () => {
    const adapter = new JszipArchiveAdapter();
    expect(() => adapter.buildStream([{ archivePath: "../etc/passwd", content: Readable.from(Buffer.from("a")) }])).toThrow(UnsafeArchivePathError);
  });

  it("produces a real, reopenable ZIP with correct file contents from streamed entries", async () => {
    const adapter = new JszipArchiveAdapter();
    const zipStream = adapter.buildStream([
      { archivePath: "sources/DC1.pdf", content: Readable.from(Buffer.from("contenu DC1")) },
      { archivePath: "manifest.json", content: Readable.from(Buffer.from(JSON.stringify({ ok: true }))) },
    ]);
    const buffer = await readStreamToBuffer(toRealReadable(zipStream));

    const reopened = await JSZip.loadAsync(buffer);
    const fileEntries = Object.values(reopened.files).filter((entry) => !entry.dir).map((entry) => entry.name);
    expect(fileEntries.sort()).toEqual(["manifest.json", "sources/DC1.pdf"]);
    expect(await reopened.file("sources/DC1.pdf")!.async("string")).toBe("contenu DC1");
    expect(JSON.parse(await reopened.file("manifest.json")!.async("string"))).toEqual({ ok: true });
  });
});
