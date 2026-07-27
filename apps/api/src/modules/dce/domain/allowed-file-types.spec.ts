import { describe, expect, it } from "vitest";
import {
  isAllowedDceFileType,
  isAllowedDceZipEntryType,
  isSignatureCompatibleWithExtension,
} from "./allowed-file-types";

describe("isAllowedDceFileType", () => {
  it("accepts every format in scope (PDF, DOCX, XLSX, XLS, ZIP, PNG, JPEG)", () => {
    expect(isAllowedDceFileType("application/pdf", "pdf")).toBe(true);
    expect(
      isAllowedDceFileType(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "docx",
      ),
    ).toBe(true);
    expect(
      isAllowedDceFileType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"),
    ).toBe(true);
    expect(isAllowedDceFileType("application/vnd.ms-excel", "xls")).toBe(true);
    expect(isAllowedDceFileType("application/zip", "zip")).toBe(true);
    expect(isAllowedDceFileType("image/png", "png")).toBe(true);
    expect(isAllowedDceFileType("image/jpeg", "jpg")).toBe(true);
    expect(isAllowedDceFileType("image/jpeg", "jpeg")).toBe(true);
  });

  it("rejects formats explicitly out of DCE's scope even though Documents allows them (DOC, CSV, TXT)", () => {
    expect(isAllowedDceFileType("application/msword", "doc")).toBe(false);
    expect(isAllowedDceFileType("text/csv", "csv")).toBe(false);
    expect(isAllowedDceFileType("text/plain", "txt")).toBe(false);
  });

  it("rejects a mismatched MIME/extension combination", () => {
    expect(isAllowedDceFileType("application/pdf", "docx")).toBe(false);
  });

  it("rejects an unsupported MIME type entirely (e.g. executables)", () => {
    expect(isAllowedDceFileType("application/x-msdownload", "exe")).toBe(false);
  });

  it("is case-insensitive on the extension", () => {
    expect(isAllowedDceFileType("application/pdf", "PDF")).toBe(true);
  });
});

describe("isAllowedDceZipEntryType", () => {
  it("rejects ZIP as a nested entry type even though ZIP is an allowed top-level import", () => {
    expect(isAllowedDceZipEntryType("application/zip", "zip")).toBe(false);
  });

  it("still accepts the other allowed formats as ZIP entries", () => {
    expect(isAllowedDceZipEntryType("application/pdf", "pdf")).toBe(true);
  });
});

describe("isSignatureCompatibleWithExtension", () => {
  it("treats an inconclusive detection (null) as compatible", () => {
    expect(isSignatureCompatibleWithExtension(null, "pdf")).toBe(true);
  });

  it("accepts a matching signature/extension pair", () => {
    expect(isSignatureCompatibleWithExtension("application/pdf", "pdf")).toBe(true);
    expect(isSignatureCompatibleWithExtension("image/jpeg", "jpg")).toBe(true);
  });

  it("accepts docx/xlsx/zip against the shared ZIP container signature", () => {
    expect(isSignatureCompatibleWithExtension("application/zip", "docx")).toBe(true);
    expect(isSignatureCompatibleWithExtension("application/zip", "xlsx")).toBe(true);
    expect(isSignatureCompatibleWithExtension("application/zip", "zip")).toBe(true);
  });

  it("rejects a JPEG disguised with a .pdf extension", () => {
    expect(isSignatureCompatibleWithExtension("image/jpeg", "pdf")).toBe(false);
  });

  it("rejects the legacy XLS signature against a non-xls extension", () => {
    expect(isSignatureCompatibleWithExtension("application/x-ole-compound", "docx")).toBe(false);
  });
});
