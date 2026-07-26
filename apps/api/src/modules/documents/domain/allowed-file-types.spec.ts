import { describe, expect, it } from "vitest";
import { isAllowedFileType } from "./allowed-file-types";

describe("isAllowedFileType", () => {
  it("accepts a known, coherent MIME/extension pair", () => {
    expect(isAllowedFileType("application/pdf", "pdf")).toBe(true);
    expect(isAllowedFileType("image/jpeg", "jpeg")).toBe(true);
    expect(isAllowedFileType("image/jpeg", "jpg")).toBe(true);
  });

  it("rejects a mismatched MIME/extension combination even if each is individually known", () => {
    expect(isAllowedFileType("application/pdf", "docx")).toBe(false);
    expect(isAllowedFileType("image/png", "pdf")).toBe(false);
  });

  it("rejects an unsupported MIME type entirely (e.g. executables)", () => {
    expect(isAllowedFileType("application/x-msdownload", "exe")).toBe(false);
  });

  it("is case-insensitive on the extension", () => {
    expect(isAllowedFileType("application/pdf", "PDF")).toBe(true);
  });
});
