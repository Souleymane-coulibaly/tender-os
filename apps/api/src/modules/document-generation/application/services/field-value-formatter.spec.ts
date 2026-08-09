import { describe, expect, it } from "vitest";
import type { DocumentTemplateFieldMapping } from "../../domain/document-template-field-mapping";
import { formatDataSnapshot, formatFieldValue } from "./field-value-formatter";

function mapping(overrides: Partial<DocumentTemplateFieldMapping>): DocumentTemplateFieldMapping {
  return { fieldKey: "x", label: "X", fieldType: "STRING", required: false, ...overrides };
}

describe("formatFieldValue", () => {
  it("STRING — coerces to a plain string", () => {
    expect(formatFieldValue(mapping({ fieldType: "STRING" }), 42)).toBe("42");
  });

  it("MULTILINE — preserves newlines verbatim (the merge engine converts them to real line breaks)", () => {
    const value = "Ligne 1\nLigne 2\nLigne 3";
    expect(formatFieldValue(mapping({ fieldType: "MULTILINE" }), value)).toBe(value);
  });

  it("DATE — formats as dd/mm/yyyy by default (fr-FR)", () => {
    expect(formatFieldValue(mapping({ fieldType: "DATE" }), new Date("2026-09-15T00:00:00Z"))).toBe("15/09/2026");
  });

  it("DATE — rejects an unparseable value rather than inventing one", () => {
    expect(() => formatFieldValue(mapping({ fieldType: "DATE" }), "not-a-date")).toThrow(/valid date/);
  });

  it("CURRENCY — formats as EUR by default", () => {
    const result = formatFieldValue(mapping({ fieldType: "CURRENCY" }), 1250.5) as string;
    expect(result).toContain("1");
    expect(result).toContain("250,50");
    expect(result).toContain("€");
  });

  it("CURRENCY — respects a formatOptions.currency override", () => {
    const result = formatFieldValue(mapping({ fieldType: "CURRENCY", formatOptions: { currency: "USD" } }), 100) as string;
    expect(result).toContain("$");
  });

  it("PERCENTAGE — formats a ratio as a percentage", () => {
    expect(formatFieldValue(mapping({ fieldType: "PERCENTAGE" }), 0.155)).toContain("15,5");
  });

  it("BOOLEAN — Oui/Non by default", () => {
    expect(formatFieldValue(mapping({ fieldType: "BOOLEAN" }), true)).toBe("Oui");
    expect(formatFieldValue(mapping({ fieldType: "BOOLEAN" }), false)).toBe("Non");
  });

  it("CHECKBOX — controlled Unicode glyphs, never a naive 'X'", () => {
    expect(formatFieldValue(mapping({ fieldType: "CHECKBOX" }), true)).toBe("☒");
    expect(formatFieldValue(mapping({ fieldType: "CHECKBOX" }), false)).toBe("☐");
  });

  it("LIST/TABLE — passes the raw array through untouched, for the merge engine's own loop", () => {
    const rows = [{ name: "a" }, { name: "b" }];
    expect(formatFieldValue(mapping({ fieldType: "TABLE" }), rows)).toBe(rows);
  });

  it("returns undefined for a null/undefined raw value — never invents a value for a missing field", () => {
    expect(formatFieldValue(mapping({ fieldType: "STRING" }), undefined)).toBeUndefined();
    expect(formatFieldValue(mapping({ fieldType: "STRING" }), null)).toBeUndefined();
  });
});

describe("formatDataSnapshot", () => {
  it("only formats fields present in the Field Mapping — an unmapped snapshot key is dropped, never injected raw", () => {
    const mappings = [mapping({ fieldKey: "tender.reference", fieldType: "STRING" })];
    const result = formatDataSnapshot(mappings, { "tender.reference": "AO-1", "unmapped.key": "should not appear" });
    expect(result).toEqual({ "tender.reference": "AO-1" });
  });
});
