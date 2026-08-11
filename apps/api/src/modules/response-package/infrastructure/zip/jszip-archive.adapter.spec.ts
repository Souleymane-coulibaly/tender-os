import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildSafeArchivePath } from "../../domain/archive-path-safety";
import { DuplicateArchivePathError, UnsafeArchivePathError } from "../../domain/errors";
import { JszipArchiveAdapter } from "./jszip-archive.adapter";

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

describe("JszipArchiveAdapter — real ZIP build, mission §115/§117", () => {
  it("BLOQUANT — refuses duplicate archive paths, never silently overwrites (§58/§117)", async () => {
    const adapter = new JszipArchiveAdapter();
    await expect(
      adapter.build([
        { archivePath: "01_Administratif/DC1.pdf", content: Buffer.from("a") },
        { archivePath: "01_Administratif/DC1.pdf", content: Buffer.from("b") },
      ]),
    ).rejects.toThrow(DuplicateArchivePathError);
  });

  it("BLOQUANT — produces a real, reopenable ZIP with correct file contents (§115)", async () => {
    const adapter = new JszipArchiveAdapter();
    const buffer = await adapter.build([
      { archivePath: "01_Administratif/DC1.pdf", content: Buffer.from("contenu DC1") },
      { archivePath: "manifest.json", content: Buffer.from(JSON.stringify({ ok: true })) },
    ]);

    const reopened = await JSZip.loadAsync(buffer);
    const fileEntries = Object.values(reopened.files).filter((entry) => !entry.dir).map((entry) => entry.name);
    expect(fileEntries.sort()).toEqual(["01_Administratif/DC1.pdf", "manifest.json"]);
    expect(await reopened.file("01_Administratif/DC1.pdf")!.async("string")).toBe("contenu DC1");
    expect(JSON.parse(await reopened.file("manifest.json")!.async("string"))).toEqual({ ok: true });
  });
});
