import { PassThrough, Readable } from "node:stream";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { readStreamToBuffer } from "../../../../shared-kernel/read-stream-to-buffer";
import { buildSafeArchivePath } from "../../domain/archive-path-safety";
import { DuplicateArchivePathError, UnsafeArchivePathError } from "../../domain/errors";
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

describe("buildSafeArchivePath — mission §59/§116 zip-slip protection", () => {
  it("BLOQUANT — rejects path traversal segments (..)", () => {
    expect(() => buildSafeArchivePath(["..", "etc", "passwd"])).toThrow(UnsafeArchivePathError);
    expect(() => buildSafeArchivePath(["01_Administratif", ".."])).toThrow(UnsafeArchivePathError);
  });

  it("BLOQUANT — rejects a segment containing a slash or backslash (absolute-path smuggling)", () => {
    expect(() => buildSafeArchivePath(["../../etc/passwd"])).toThrow(UnsafeArchivePathError);
    expect(() => buildSafeArchivePath(["C:\\Windows\\System32"])).toThrow(UnsafeArchivePathError);
  });

  it("builds a normal safe path", () => {
    expect(buildSafeArchivePath(["01_Administratif", "DC1.pdf"])).toBe("01_Administratif/DC1.pdf");
  });

  it("sanitizes unsafe characters rather than crashing", () => {
    expect(buildSafeArchivePath(["fichier<test>.pdf"])).toBe("fichier_test_.pdf");
  });
});

describe("JszipArchiveAdapter — real ZIP build (streaming), mission §115/§117", () => {
  it("BLOQUANT — refuses duplicate archive paths, never silently overwrites (§58/§117)", () => {
    const adapter = new JszipArchiveAdapter();
    // P2 (audit Codex, ZIP memory) — buildStream() valide les chemins de manière synchrone AVANT
    // toute génération : l'erreur est levée immédiatement, jamais via une promesse rejetée.
    expect(() =>
      adapter.buildStream([
        { archivePath: "01_Administratif/DC1.pdf", content: Readable.from(Buffer.from("a")) },
        { archivePath: "01_Administratif/DC1.pdf", content: Readable.from(Buffer.from("b")) },
      ]),
    ).toThrow(DuplicateArchivePathError);
  });

  it("BLOQUANT — produces a real, reopenable ZIP with correct file contents (§115)", async () => {
    const adapter = new JszipArchiveAdapter();
    const zipStream = adapter.buildStream([
      { archivePath: "01_Administratif/DC1.pdf", content: Readable.from(Buffer.from("contenu DC1")) },
      { archivePath: "manifest.json", content: Readable.from(Buffer.from(JSON.stringify({ ok: true }))) },
    ]);
    const buffer = await readStreamToBuffer(toRealReadable(zipStream));

    const reopened = await JSZip.loadAsync(buffer);
    const fileEntries = Object.values(reopened.files).filter((entry) => !entry.dir).map((entry) => entry.name);
    expect(fileEntries.sort()).toEqual(["01_Administratif/DC1.pdf", "manifest.json"]);
    expect(await reopened.file("01_Administratif/DC1.pdf")!.async("string")).toBe("contenu DC1");
    expect(JSON.parse(await reopened.file("manifest.json")!.async("string"))).toEqual({ ok: true });
  });
});
