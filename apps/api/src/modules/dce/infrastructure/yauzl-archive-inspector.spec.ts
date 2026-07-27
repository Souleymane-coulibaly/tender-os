import { describe, expect, it } from "vitest";
import { ZipSecurityViolationError } from "../domain/errors";
import type { ZipImportLimits } from "../application/ports/zip-archive-inspector";
import { buildZipBuffer } from "../test-support/zip-builder";
import { YauzlArchiveInspector } from "./yauzl-archive-inspector";

const GENEROUS_LIMITS: ZipImportLimits = {
  maxEntries: 100,
  maxTotalUncompressedBytes: 50 * 1024 * 1024,
  maxSingleEntryUncompressedBytes: 20 * 1024 * 1024,
  maxCompressionRatio: 200,
};

describe("YauzlArchiveInspector", () => {
  const inspector = new YauzlArchiveInspector();

  it("extracts every file entry of a well-formed archive, skipping directory entries", async () => {
    const zip = buildZipBuffer([
      { name: "folder/", content: Buffer.alloc(0) },
      { name: "folder/cctp.pdf", content: Buffer.from("%PDF-1.7 fake content") },
      { name: "reglement.docx", content: Buffer.from("fake docx bytes") },
    ]);

    const result = await inspector.extract({ buffer: zip, limits: GENEROUS_LIMITS });

    expect(result).toHaveLength(2);
    expect(result.map((entry) => entry.entryName).sort()).toEqual(["folder/cctp.pdf", "reglement.docx"]);
    expect(result.find((entry) => entry.entryName === "reglement.docx")?.buffer.toString()).toBe("fake docx bytes");
  });

  it("rejects a path-traversal entry (../file.pdf)", async () => {
    const zip = buildZipBuffer([{ name: "../../etc/passwd.pdf", content: Buffer.from("x") }]);

    await expect(inspector.extract({ buffer: zip, limits: GENEROUS_LIMITS })).rejects.toThrow(
      ZipSecurityViolationError,
    );
  });

  it("rejects an absolute path entry", async () => {
    const zip = buildZipBuffer([{ name: "/etc/passwd", content: Buffer.from("x") }]);

    await expect(inspector.extract({ buffer: zip, limits: GENEROUS_LIMITS })).rejects.toThrow(
      ZipSecurityViolationError,
    );
  });

  it("rejects a symbolic link entry", async () => {
    const zip = buildZipBuffer([{ name: "link.pdf", content: Buffer.from("x"), isSymlink: true }]);

    await expect(inspector.extract({ buffer: zip, limits: GENEROUS_LIMITS })).rejects.toThrow(
      ZipSecurityViolationError,
    );
  });

  it("rejects an archive exceeding the entry-count limit", async () => {
    const entries = Array.from({ length: 5 }, (_, index) => ({
      name: `file-${index}.pdf`,
      content: Buffer.from("x"),
    }));
    const zip = buildZipBuffer(entries);

    await expect(
      inspector.extract({ buffer: zip, limits: { ...GENEROUS_LIMITS, maxEntries: 3 } }),
    ).rejects.toThrow(ZipSecurityViolationError);
  });

  it("rejects a single entry exceeding the per-entry decompressed size limit", async () => {
    const zip = buildZipBuffer([{ name: "huge.pdf", content: Buffer.alloc(1000) }]);

    await expect(
      inspector.extract({ buffer: zip, limits: { ...GENEROUS_LIMITS, maxSingleEntryUncompressedBytes: 500 } }),
    ).rejects.toThrow(ZipSecurityViolationError);
  });

  it("rejects an archive exceeding the total decompressed size limit", async () => {
    const zip = buildZipBuffer([
      { name: "a.pdf", content: Buffer.alloc(400) },
      { name: "b.pdf", content: Buffer.alloc(400) },
    ]);

    await expect(
      inspector.extract({ buffer: zip, limits: { ...GENEROUS_LIMITS, maxTotalUncompressedBytes: 500 } }),
    ).rejects.toThrow(ZipSecurityViolationError);
  });

  it("rejects an excessive compression ratio (zip-bomb style entry)", async () => {
    const zip = buildZipBuffer([
      {
        name: "bomb.pdf",
        content: Buffer.alloc(1024, 0),
        method: "deflate",
        declaredUncompressedSize: 10 * 1024 * 1024,
      },
    ]);

    await expect(
      inspector.extract({ buffer: zip, limits: { ...GENEROUS_LIMITS, maxCompressionRatio: 50 } }),
    ).rejects.toThrow(ZipSecurityViolationError);
  });

  it("rejects a corrupted archive (not a valid ZIP structure)", async () => {
    const corrupted = Buffer.from("this is not a zip file at all");

    await expect(inspector.extract({ buffer: corrupted, limits: GENEROUS_LIMITS })).rejects.toThrow(
      ZipSecurityViolationError,
    );
  });

  it("rejects a partially corrupted archive (truncated mid central-directory)", async () => {
    const zip = buildZipBuffer([
      { name: "a.pdf", content: Buffer.from("aaa") },
      { name: "b.pdf", content: Buffer.from("bbb") },
    ]);
    const truncated = zip.subarray(0, zip.length - 10);

    await expect(inspector.extract({ buffer: truncated, limits: GENEROUS_LIMITS })).rejects.toThrow(
      ZipSecurityViolationError,
    );
  });

  it("accepts Unicode and special-character filenames", async () => {
    const zip = buildZipBuffer([{ name: "réponse é_(1)&spécial.pdf", content: Buffer.from("x") }]);

    const result = await inspector.extract({ buffer: zip, limits: GENEROUS_LIMITS });

    expect(result).toHaveLength(1);
    expect(result[0]!.entryName).toBe("réponse é_(1)&spécial.pdf");
  });
});
