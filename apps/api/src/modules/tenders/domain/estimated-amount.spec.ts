import { describe, expect, it } from "vitest";
import { InvalidLotEstimatedAmountError } from "./errors";
import { parseEstimatedAmount } from "./estimated-amount";

describe("parseEstimatedAmount", () => {
  it("accepts a valid positive decimal amount", () => {
    expect(parseEstimatedAmount("125000")).toBe("125000");
    expect(parseEstimatedAmount("125000.50")).toBe("125000.50");
  });

  it("accepts the maximum precision allowed by Decimal(19,4)", () => {
    expect(parseEstimatedAmount("123456789012345.1234")).toBe("123456789012345.1234");
  });

  it("rejects non-numeric text", () => {
    expect(() => parseEstimatedAmount("abc")).toThrow(InvalidLotEstimatedAmountError);
    expect(() => parseEstimatedAmount("12,000")).toThrow(InvalidLotEstimatedAmountError);
    expect(() => parseEstimatedAmount("1e10")).toThrow(InvalidLotEstimatedAmountError);
  });

  it("rejects NaN and non-finite values", () => {
    expect(() => parseEstimatedAmount("NaN")).toThrow(InvalidLotEstimatedAmountError);
    expect(() => parseEstimatedAmount("Infinity")).toThrow(InvalidLotEstimatedAmountError);
  });

  it("rejects zero and negative amounts", () => {
    expect(() => parseEstimatedAmount("0")).toThrow(InvalidLotEstimatedAmountError);
    expect(() => parseEstimatedAmount("-100")).toThrow(InvalidLotEstimatedAmountError);
  });

  it("rejects a value exceeding Decimal(19,4) precision or scale", () => {
    expect(() => parseEstimatedAmount("1234567890123456")).toThrow(InvalidLotEstimatedAmountError); // 16 integer digits
    expect(() => parseEstimatedAmount("100.12345")).toThrow(InvalidLotEstimatedAmountError); // 5 decimal digits
  });
});
