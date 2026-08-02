import { describe, expect, it } from "vitest";
import { assertArchivePathIsContained, buildSafeArchivePath } from "./archive-path-safety";

describe("buildSafeArchivePath", () => {
  it("joins safe segments with a forward slash", () => {
    expect(buildSafeArchivePath(["01-memoire-technique.docx"])).toBe("01-memoire-technique.docx");
  });

  it("rejects a segment containing '..' (zip slip)", () => {
    expect(() => buildSafeArchivePath(["..", "etc", "passwd"])).toThrow();
  });

  it("rejects a segment containing a path separator", () => {
    expect(() => buildSafeArchivePath(["a/b"])).toThrow();
    expect(() => buildSafeArchivePath(["a\\b"])).toThrow();
  });

  it("rejects a reserved Windows device name", () => {
    expect(() => buildSafeArchivePath(["CON.docx"])).toThrow();
    expect(() => buildSafeArchivePath(["nul"])).toThrow();
  });

  it("neutralizes unsafe characters rather than throwing when the segment is otherwise valid", () => {
    expect(buildSafeArchivePath(['file<>:"|?*.docx'])).toBe("file_______.docx");
  });
});

describe("assertArchivePathIsContained", () => {
  it("rejects an absolute unix path", () => {
    expect(() => assertArchivePathIsContained("/etc/passwd")).toThrow();
  });

  it("rejects an absolute windows path", () => {
    expect(() => assertArchivePathIsContained("C:/Windows/System32")).toThrow();
  });

  it("rejects a path containing a '..' segment", () => {
    expect(() => assertArchivePathIsContained("a/../../b")).toThrow();
  });

  it("accepts a normal relative path", () => {
    expect(() => assertArchivePathIsContained("documents/memoire.docx")).not.toThrow();
  });
});
