import { describe, expect, it } from "vitest";
import { PricingAssumptions } from "./pricing-assumptions";

/**
 * Réaudit Codex Sprint 7 — "Decimal compromis par Number(...)" : `assertRate()` valide `hourlyRate`
 * et `additionalFeesAmount` exclusivement via `Decimal`, jamais `Number(...)` (imprécision en
 * virgule flottante sur de très petits/grands montants ou des décimales longues).
 */
describe("PricingAssumptions — assertRate (Decimal-only validation)", () => {
  it("accepts a valid hourlyRate", () => {
    expect(() => PricingAssumptions.create({ hourlyRate: "50" })).not.toThrow();
  });

  it("accepts a very small hourlyRate", () => {
    expect(() => PricingAssumptions.create({ hourlyRate: "0.000001" })).not.toThrow();
  });

  it("accepts a hourlyRate with long decimals", () => {
    expect(() => PricingAssumptions.create({ hourlyRate: "49.123456789" })).not.toThrow();
  });

  it("accepts a hourlyRate at the maximum bound", () => {
    expect(() => PricingAssumptions.create({ hourlyRate: "100000" })).not.toThrow();
  });

  it("rejects a hourlyRate above the maximum bound", () => {
    expect(() => PricingAssumptions.create({ hourlyRate: "100000.000001" })).toThrow();
  });

  it("rejects a negative hourlyRate", () => {
    expect(() => PricingAssumptions.create({ hourlyRate: "-1" })).toThrow();
  });

  it("rejects a non-numeric hourlyRate", () => {
    expect(() => PricingAssumptions.create({ hourlyRate: "not-a-number" })).toThrow();
  });

  it("rejects an empty hourlyRate", () => {
    expect(() => PricingAssumptions.create({ hourlyRate: "" })).toThrow();
  });

  it("accepts a valid additionalFeesAmount", () => {
    expect(() => PricingAssumptions.create({ additionalFeesAmount: "12.5" })).not.toThrow();
  });

  it("rejects a negative additionalFeesAmount", () => {
    expect(() => PricingAssumptions.create({ additionalFeesAmount: "-0.01" })).toThrow();
  });
});
