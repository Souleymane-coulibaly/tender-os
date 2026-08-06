import { describe, expect, it } from "vitest";
import { isValidFrenchVatNumber, isValidSiren, isValidSiret } from "./french-company-identifiers";

describe("isValidSiren", () => {
  it("accepts a real, checksum-valid SIREN (INSEE)", () => {
    expect(isValidSiren("356000000")).toBe(true);
  });

  it("rejects a SIREN with an invalid checksum", () => {
    expect(isValidSiren("356000001")).toBe(false);
  });

  it("rejects a value that is not exactly 9 digits", () => {
    expect(isValidSiren("12345")).toBe(false);
    expect(isValidSiren("12345678901")).toBe(false);
    expect(isValidSiren("35600000A")).toBe(false);
  });
});

describe("isValidSiret", () => {
  it("accepts a real, checksum-valid SIRET", () => {
    expect(isValidSiret("35600000000048")).toBe(true);
  });

  it("rejects a SIRET with an invalid checksum", () => {
    expect(isValidSiret("35600000000049")).toBe(false);
  });

  it("rejects a value that is not exactly 14 digits", () => {
    expect(isValidSiret("356000000")).toBe(false);
  });
});

describe("isValidFrenchVatNumber", () => {
  it("accepts a well-formed FR VAT number matching the SIREN checksum key", () => {
    // clé = (12 + 3 * (356000000 % 97)) % 97
    const siren = "356000000";
    const key = (12 + 3 * (Number(siren) % 97)) % 97;
    const vat = `FR${String(key).padStart(2, "0")}${siren}`;
    expect(isValidFrenchVatNumber(vat)).toBe(true);
  });

  it("rejects a FR VAT number with a mismatched key", () => {
    expect(isValidFrenchVatNumber("FR00356000000")).toBe(false);
  });

  it("rejects a non-FR-shaped value", () => {
    expect(isValidFrenchVatNumber("DE123456789")).toBe(false);
    expect(isValidFrenchVatNumber("not-a-vat")).toBe(false);
  });
});
