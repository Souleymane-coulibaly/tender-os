import { describe, expect, it } from "vitest";
import { Money } from "./money.value-object";

describe("Money", () => {
  it("creates a valid amount and normalizes the currency to uppercase", () => {
    const money = Money.create({ amount: "12.40", currency: "eur" });
    expect(money.currency).toBe("EUR");
    expect(money.toFixed()).toBe("12.400000");
    expect(money.toDisplayString()).toBe("12.40");
  });

  it("rejects a negative amount (mission: no negative amount without an explicit business case)", () => {
    expect(() => Money.create({ amount: "-1", currency: "EUR" })).toThrow();
  });

  it("rejects a non-numeric amount", () => {
    expect(() => Money.create({ amount: "not-a-number", currency: "EUR" })).toThrow();
  });

  it("rejects an amount above the defensive maximum (overflow protection)", () => {
    expect(() => Money.create({ amount: "9999999999999999", currency: "EUR" })).toThrow();
  });

  it("rejects a currency that is not a 3-letter ISO code", () => {
    expect(() => Money.create({ amount: "10", currency: "EU" })).toThrow();
    expect(() => Money.create({ amount: "10", currency: "EURO" })).toThrow();
  });

  it("zero() creates a zero amount in the given currency", () => {
    const zero = Money.zero("USD");
    expect(zero.isZero).toBe(true);
    expect(zero.currency).toBe("USD");
  });

  it("add() sums two amounts of the same currency", () => {
    const a = Money.create({ amount: "10", currency: "EUR" });
    const b = Money.create({ amount: "5.5", currency: "EUR" });
    expect(a.add(b).toFixed()).toBe("15.500000");
  });

  it("add() throws CURRENCY_MISMATCH when currencies differ — never a silent conversion", () => {
    const eur = Money.create({ amount: "10", currency: "EUR" });
    const usd = Money.create({ amount: "10", currency: "USD" });
    expect(() => eur.add(usd)).toThrow();
    try {
      eur.add(usd);
    } catch (error) {
      expect((error as Error & { code?: string }).code).toBe("CURRENCY_MISMATCH");
    }
  });

  it("multiply() scales the amount, preserving currency", () => {
    const unitPrice = Money.create({ amount: "5", currency: "EUR" });
    expect(unitPrice.multiply(3).toFixed()).toBe("15.000000");
  });

  it("uses Decimal precision, never float imprecision, for many small multiplications", () => {
    const rate = Money.create({ amount: "0.0000015", currency: "USD" });
    const cost = rate.multiply(2_000_000);
    expect(cost.toFixed()).toBe("3.000000");
  });

  describe("réaudit Sprint 7 — devise non validée ISO/supportée", () => {
    it("accepts EUR", () => {
      expect(() => Money.create({ amount: "10", currency: "EUR" })).not.toThrow();
    });

    it("rejects an empty currency", () => {
      expect(() => Money.create({ amount: "10", currency: "" })).toThrow();
      try {
        Money.create({ amount: "10", currency: "" });
      } catch (error) {
        expect((error as Error & { code?: string }).code).toBe("INVALID_CURRENCY");
      }
    });

    it("rejects a well-formatted but unknown currency code (format alone is not enough)", () => {
      expect(() => Money.create({ amount: "10", currency: "XYZ" })).toThrow();
      try {
        Money.create({ amount: "10", currency: "XYZ" });
      } catch (error) {
        expect((error as Error & { code?: string }).code).toBe("INVALID_CURRENCY");
      }
    });

    it("rejects a currency explicitly outside the supported whitelist", () => {
      expect(() => Money.create({ amount: "10", currency: "JPY" })).toThrow();
    });

    it("multi-currency aggregation: two Money in different currencies are never merged, only tracked per currency", () => {
      const eur = Money.create({ amount: "10", currency: "EUR" });
      const usd = Money.create({ amount: "10", currency: "USD" });
      const totalsByCurrency: Record<string, Money> = { [eur.currency]: eur, [usd.currency]: usd };
      expect(Object.keys(totalsByCurrency).sort()).toEqual(["EUR", "USD"]);
      expect(() => eur.add(usd)).toThrow();
    });

    it("comparing amounts in different currencies throws CURRENCY_MISMATCH rather than a silent conversion", () => {
      const eur = Money.create({ amount: "10", currency: "EUR" });
      const usd = Money.create({ amount: "10", currency: "USD" });
      expect(() => eur.differenceFrom(usd)).toThrow();
      try {
        eur.differenceFrom(usd);
      } catch (error) {
        expect((error as Error & { code?: string }).code).toBe("CURRENCY_MISMATCH");
      }
    });
  });

  describe("réaudit Sprint 7 — Decimal compromis par Number(...)", () => {
    it("differenceFrom keeps full precision on very small amounts", () => {
      const actual = Money.create({ amount: "0.000003", currency: "EUR" });
      const estimated = Money.create({ amount: "0.000001", currency: "EUR" });
      expect(actual.differenceFrom(estimated)).toBe("0.000002");
    });

    it("differenceFrom keeps full precision on very large amounts", () => {
      const actual = Money.create({ amount: "999999999999.999999", currency: "EUR" });
      const estimated = Money.create({ amount: "1.000001", currency: "EUR" });
      expect(actual.differenceFrom(estimated)).toBe("999999999998.999998");
    });

    it("differenceFrom keeps long decimals without float rounding drift", () => {
      const actual = Money.create({ amount: "0.1", currency: "EUR" });
      const estimated = Money.create({ amount: "0.2", currency: "EUR" });
      // 0.1 - 0.2 === -0.1, but naive `Number(...)` arithmetic yields -0.09999999999999998.
      expect(actual.differenceFrom(estimated)).toBe("-0.100000");
    });

    it("differenceFrom is negative when actual is lower than estimated (explicit business case)", () => {
      const actual = Money.create({ amount: "5", currency: "EUR" });
      const estimated = Money.create({ amount: "10", currency: "EUR" });
      expect(actual.differenceFrom(estimated)).toBe("-5.000000");
    });

    it("summing many small costs keeps exact precision, never a float drift", () => {
      let total = Money.zero("EUR");
      for (let i = 0; i < 10; i += 1) {
        total = total.add(Money.create({ amount: "0.1", currency: "EUR" }));
      }
      expect(total.toFixed()).toBe("1.000000");
    });

    it("percentageDifferenceFrom returns undefined rather than dividing by zero", () => {
      const actual = Money.create({ amount: "10", currency: "EUR" });
      const estimated = Money.zero("EUR");
      expect(actual.percentageDifferenceFrom(estimated)).toBeUndefined();
    });

    it("percentageDifferenceFrom rounds to 2 decimals at the display boundary", () => {
      const actual = Money.create({ amount: "10", currency: "EUR" });
      const estimated = Money.create({ amount: "3", currency: "EUR" });
      expect(actual.percentageDifferenceFrom(estimated)).toBe("233.33");
    });
  });
});
