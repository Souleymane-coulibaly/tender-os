import { describe, expect, it } from "vitest";
import { validateFieldMapping } from "./document-template-field-mapping";

describe("validateFieldMapping", () => {
  it("accepts a well-formed mapping", () => {
    const mapping = validateFieldMapping({ fieldKey: "tender.reference", label: "Référence", fieldType: "STRING", required: true });
    expect(mapping).toEqual({ fieldKey: "tender.reference", label: "Référence", fieldType: "STRING", required: true, formatOptions: undefined });
  });

  it("defaults required to false when absent", () => {
    const mapping = validateFieldMapping({ fieldKey: "tender.reference", label: "Référence", fieldType: "STRING" });
    expect(mapping.required).toBe(false);
  });

  it("rejects a missing fieldKey", () => {
    expect(() => validateFieldMapping({ label: "x", fieldType: "STRING" })).toThrow(/fieldKey/);
  });

  it("rejects an empty label", () => {
    expect(() => validateFieldMapping({ fieldKey: "x", label: "", fieldType: "STRING" })).toThrow(/label/);
  });

  it("rejects an unknown fieldType — never silently accepts an invented business type", () => {
    expect(() => validateFieldMapping({ fieldKey: "x", label: "x", fieldType: "SIRET" })).toThrow(/fieldType/);
  });

  it("rejects a non-object input", () => {
    expect(() => validateFieldMapping("not-an-object")).toThrow(/object/);
  });

  it("preserves formatOptions when provided", () => {
    const mapping = validateFieldMapping({ fieldKey: "amount", label: "Montant", fieldType: "CURRENCY", formatOptions: { currency: "USD" } });
    expect(mapping.formatOptions).toEqual({ currency: "USD" });
  });
});
