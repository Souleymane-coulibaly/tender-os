import { describe, expect, it } from "vitest";
import { ibanLast4, isValidBic, isValidIban, maskIban, normalizeIban } from "./bank-identifiers";

describe("CCV2-C.1 — identifiants bancaires (ISO 13616 / ISO 9362)", () => {
  it("accepte des IBAN valides de PLUSIEURS pays, jamais une validation franco-centrée", () => {
    for (const iban of [
      "FR7630006000011234567890189", // France
      "DE89370400440532013000", // Allemagne
      "GB82WEST12345698765432", // Royaume-Uni
      "BE68539007547034", // Belgique (16 caractères)
      "NO9386011117947", // Norvège (15 caractères, le plus court)
      "MT84MALT011000012345MTLCAST001S", // Malte (31 caractères)
    ]) {
      expect(isValidIban(iban)).toBe(true);
    }
  });

  it("rejette un IBAN dont la clé de contrôle est fausse", () => {
    expect(isValidIban("FR7630006000011234567890188")).toBe(false);
    expect(isValidIban("DE89370400440532013001")).toBe(false);
  });

  it("rejette une structure invalide : trop court, minuscules de pays, caractères interdits, vide", () => {
    expect(isValidIban("FR76")).toBe(false);
    expect(isValidIban("7630006000011234567890189")).toBe(false);
    expect(isValidIban("FR76-3000-6000-0112-3456-7890-189")).toBe(false);
    expect(isValidIban("")).toBe(false);
    expect(isValidIban("   ")).toBe(false);
  });

  it("normalise espaces et casse selon la présentation usuelle par groupes de 4", () => {
    expect(normalizeIban("fr76 3000 6000 0112 3456 7890 189")).toBe("FR7630006000011234567890189");
    expect(isValidIban("FR76 3000 6000 0112 3456 7890 189")).toBe(true);
  });

  it("valide un BIC à 8 ou 11 caractères et rejette les autres formes", () => {
    expect(isValidBic("AGRIFRPP")).toBe(true);
    expect(isValidBic("AGRIFRPPXXX")).toBe(true);
    expect(isValidBic("agrifrpp")).toBe(true);
    expect(isValidBic("AGRIFRP")).toBe(false);
    expect(isValidBic("AGRIFRPPXX")).toBe(false);
    expect(isValidBic("AGRI1RPP")).toBe(false);
    expect(isValidBic("")).toBe(false);
  });

  it("ne révèle jamais plus que les 4 derniers caractères", () => {
    expect(maskIban("FR7630006000011234567890189")).toBe(`${"•".repeat(23)}0189`);
    expect(maskIban("AB12")).toBe("••••");
    expect(ibanLast4("FR7630006000011234567890189")).toBe("0189");
    expect(maskIban("FR7630006000011234567890189")).not.toContain("7630006000");
  });
});
