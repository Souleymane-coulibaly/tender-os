import { describe, expect, it } from "vitest";
import { classifyFinancialDocumentType } from "./financial-document-type-classifier";
import { FinancialDocumentType } from "../domain/enums";

describe("classifyFinancialDocumentType", () => {
  it.each([
    ["DQE_Lot1.xlsx", FinancialDocumentType.Dqe],
    ["Décomposition Quantitatif Estimatif.xlsx", FinancialDocumentType.Dqe],
    ["DPGF-lot-02.xlsx", FinancialDocumentType.Dpgf],
    ["BPU_Lot1.xlsx", FinancialDocumentType.Bpu],
    ["Bordereau des prix unitaires.xlsx", FinancialDocumentType.Bpu],
  ])("classifies %s as %s", (filename, expected) => {
    expect(classifyFinancialDocumentType({ filename })).toBe(expected);
  });

  it("BLOQUANT — a financially-categorized file that matches no known keyword falls back to OTHER_FINANCIAL_SCHEDULE, never a guess", () => {
    expect(classifyFinancialDocumentType({ filename: "Annexe financière.xlsx" })).toBe(FinancialDocumentType.OtherFinancialSchedule);
  });

  it("is case-insensitive and accent-insensitive", () => {
    expect(classifyFinancialDocumentType({ filename: "dqe.XLSX" })).toBe(FinancialDocumentType.Dqe);
  });
});
