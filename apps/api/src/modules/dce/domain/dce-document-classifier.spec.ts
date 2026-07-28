import { describe, expect, it } from "vitest";
import { classifyDceDocument } from "./dce-document-classifier";
import { DceDocumentCategory } from "./dce-document-category";

describe("classifyDceDocument", () => {
  it("classifies CCTP-style filenames as TECHNICAL", () => {
    expect(classifyDceDocument({ filename: "CCTP.pdf", extension: "pdf" })).toBe(DceDocumentCategory.Technical);
    expect(classifyDceDocument({ filename: "cctp_lot1.pdf", extension: "pdf" })).toBe(DceDocumentCategory.Technical);
  });

  it("classifies BPU/DPGF/DQE-style filenames as FINANCIAL", () => {
    expect(classifyDceDocument({ filename: "BPU.xlsx", extension: "xlsx" })).toBe(DceDocumentCategory.Financial);
    expect(classifyDceDocument({ filename: "dpgf-lot-2.xlsx", extension: "xlsx" })).toBe(DceDocumentCategory.Financial);
    expect(classifyDceDocument({ filename: "DQE.xls", extension: "xls" })).toBe(DceDocumentCategory.Financial);
  });

  it("classifies RC/CCAP/AAPC-style filenames as ADMINISTRATIVE", () => {
    expect(classifyDceDocument({ filename: "RC.pdf", extension: "pdf" })).toBe(DceDocumentCategory.Administrative);
    expect(classifyDceDocument({ filename: "CCAP.pdf", extension: "pdf" })).toBe(DceDocumentCategory.Administrative);
    expect(classifyDceDocument({ filename: "reglement-consultation.pdf", extension: "pdf" })).toBe(
      DceDocumentCategory.Administrative,
    );
  });

  it("is accent- and case-insensitive (règlement === reglement)", () => {
    expect(classifyDceDocument({ filename: "Règlement.pdf", extension: "pdf" })).toBe(
      DceDocumentCategory.Administrative,
    );
  });

  it("classifies an image with no recognizable keyword as DRAWINGS", () => {
    expect(classifyDceDocument({ filename: "plan-masse.png", extension: "png" })).toBe(DceDocumentCategory.Drawings);
    expect(classifyDceDocument({ filename: "photo.jpg", extension: "jpg" })).toBe(DceDocumentCategory.Drawings);
  });

  it("falls back to OTHER when nothing matches", () => {
    expect(classifyDceDocument({ filename: "annexe-1.pdf", extension: "pdf" })).toBe(DceDocumentCategory.Other);
  });

  it("prioritizes the financial signal over a coincidental administrative one", () => {
    // "acte" (administrative) and "bpu" (financial) both present — financial wins by design.
    expect(classifyDceDocument({ filename: "acte-bpu.pdf", extension: "pdf" })).toBe(DceDocumentCategory.Financial);
  });
});
