import { describe, expect, it } from "vitest";
import { MagicByteFileSignatureDetector } from "./magic-byte-file-signature.detector";

describe("MagicByteFileSignatureDetector", () => {
  const detector = new MagicByteFileSignatureDetector();

  it("detects a PDF signature", () => {
    const buffer = Buffer.concat([Buffer.from("%PDF-1.7"), Buffer.alloc(10)]);
    expect(detector.detect(buffer)).toEqual({ mimeType: "application/pdf" });
  });

  it("detects the ZIP/DOCX/XLSX shared container signature", () => {
    const buffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
    expect(detector.detect(buffer)).toEqual({ mimeType: "application/zip" });
  });

  it("detects the legacy XLS (OLE2) signature", () => {
    const buffer = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00]);
    expect(detector.detect(buffer)).toEqual({ mimeType: "application/x-ole-compound" });
  });

  it("detects a PNG signature", () => {
    const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    expect(detector.detect(buffer)).toEqual({ mimeType: "image/png" });
  });

  it("detects a JPEG signature", () => {
    const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
    expect(detector.detect(buffer)).toEqual({ mimeType: "image/jpeg" });
  });

  it("returns null for unrecognized content (e.g. an executable disguised as a document)", () => {
    const buffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00]); // MZ (PE executable)
    expect(detector.detect(buffer)).toBeNull();
  });

  it("returns null for a buffer too short to contain any known signature", () => {
    expect(detector.detect(Buffer.from([0x25]))).toBeNull();
  });
});
