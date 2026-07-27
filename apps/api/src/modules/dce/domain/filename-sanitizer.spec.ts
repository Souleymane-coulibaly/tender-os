import { describe, expect, it } from "vitest";
import { InvalidFilenameError } from "./errors";
import { extractExtension, sanitizeFilename } from "./filename-sanitizer";

describe("sanitizeFilename", () => {
  it("keeps a normal filename intact", () => {
    expect(sanitizeFilename("cctp.pdf")).toBe("cctp.pdf");
  });

  it("strips path segments (path traversal protection)", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("C:\\Windows\\System32\\evil.exe")).toBe("evil.exe");
  });

  it("replaces unsafe characters", () => {
    expect(sanitizeFilename('bad:name*?"<>|.pdf')).not.toMatch(/[:*?"<>|]/);
  });

  it("throws InvalidFilenameError for an empty or degenerate name", () => {
    expect(() => sanitizeFilename("")).toThrow(InvalidFilenameError);
    expect(() => sanitizeFilename("   ")).toThrow(InvalidFilenameError);
    expect(() => sanitizeFilename("..")).toThrow(InvalidFilenameError);
  });
});

describe("extractExtension", () => {
  it("extracts a lowercase extension", () => {
    expect(extractExtension("CCTP.PDF")).toBe("pdf");
  });

  it("returns an empty string when there is no extension", () => {
    expect(extractExtension("README")).toBe("");
  });
});
