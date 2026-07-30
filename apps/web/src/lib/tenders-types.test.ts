import { describe, expect, it } from "vitest";
import {
  canChangeTenderStatus,
  canEditTenderDetails,
  DEFAULT_TENDER_COUNTRY,
  DEFAULT_TENDER_CURRENCY,
  DEFAULT_TENDER_LANGUAGE,
  DEFAULT_TENDER_MARKET_TYPE,
  DEFAULT_TENDER_SOURCE,
  isValidEstimatedAmount,
} from "./tenders-types";

describe("canChangeTenderStatus", () => {
  it("allows roles that hold tender:update on the backend", () => {
    expect(canChangeTenderStatus("ORGANIZATION_ADMIN")).toBe(true);
    expect(canChangeTenderStatus("BID_MANAGER")).toBe(true);
  });

  it("denies read-only and other roles that lack tender:update on the backend", () => {
    expect(canChangeTenderStatus("READ_ONLY")).toBe(false);
    expect(canChangeTenderStatus("REVIEWER")).toBe(false);
    expect(canChangeTenderStatus("CONTRIBUTOR")).toBe(false);
    expect(canChangeTenderStatus(undefined)).toBe(false);
  });
});

describe("canEditTenderDetails", () => {
  it("mirrors canManageTenderLots (same tender:update permission)", () => {
    expect(canEditTenderDetails("ORGANIZATION_ADMIN")).toBe(true);
    expect(canEditTenderDetails("BID_MANAGER")).toBe(true);
    expect(canEditTenderDetails("READ_ONLY")).toBe(false);
    expect(canEditTenderDetails(undefined)).toBe(false);
  });
});

describe("manual-creation-in-France defaults", () => {
  it("match the mission's expected values (FR / fr / EUR / MANUAL / PUBLIC)", () => {
    expect(DEFAULT_TENDER_COUNTRY).toBe("FR");
    expect(DEFAULT_TENDER_LANGUAGE).toBe("fr");
    expect(DEFAULT_TENDER_CURRENCY).toBe("EUR");
    expect(DEFAULT_TENDER_SOURCE).toBe("MANUAL");
    expect(DEFAULT_TENDER_MARKET_TYPE).toBe("PUBLIC");
  });
});

describe("isValidEstimatedAmount", () => {
  it("accepts a plain positive integer or decimal string (dot separator)", () => {
    expect(isValidEstimatedAmount("50000")).toBe(true);
    expect(isValidEstimatedAmount("50000.50")).toBe(true);
  });

  it("rejects thousands separators, currency symbols, and comma decimals", () => {
    expect(isValidEstimatedAmount("50 000")).toBe(false);
    expect(isValidEstimatedAmount("50000,50")).toBe(false);
    expect(isValidEstimatedAmount("50000 EUR")).toBe(false);
  });

  it("rejects zero and negative amounts (backend requires a strictly positive Decimal)", () => {
    expect(isValidEstimatedAmount("0")).toBe(false);
    expect(isValidEstimatedAmount("-100")).toBe(false);
  });

  it("rejects a value that would not fit Decimal(19,4)", () => {
    expect(isValidEstimatedAmount("1".repeat(16))).toBe(false);
    expect(isValidEstimatedAmount("1.12345")).toBe(false);
  });
});
