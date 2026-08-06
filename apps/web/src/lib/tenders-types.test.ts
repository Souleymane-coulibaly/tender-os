import { describe, expect, it } from "vitest";
import {
  ALLOWED_TENDER_TRANSITIONS,
  canChangeTenderCandidate,
  canChangeTenderStatus,
  canEditTenderDetails,
  canOfferCandidateChange,
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

  // Mission Sprint 8A.2 (audit Cockpit Bid Manager) — régression : OWNER manquait du miroir
  // ROLES_ALLOWED_TO_CHANGE_STATUS (jamais mis à jour après le correctif backend OWNER de
  // tender-permission.ts), masquant le changement de statut pour un propriétaire d'organisation.
  it("allows OWNER (superset of ORGANIZATION_ADMIN, backend-mirrored)", () => {
    expect(canChangeTenderStatus("OWNER")).toBe(true);
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
    expect(canEditTenderDetails("OWNER")).toBe(true);
    expect(canEditTenderDetails("ORGANIZATION_ADMIN")).toBe(true);
    expect(canEditTenderDetails("BID_MANAGER")).toBe(true);
    expect(canEditTenderDetails("READ_ONLY")).toBe(false);
    expect(canEditTenderDetails(undefined)).toBe(false);
  });
});

describe("ALLOWED_TENDER_TRANSITIONS — ARCHIVED (V2 Sprint 3 §7/§29 correctif restauration)", () => {
  it("allows a restore-to-DRAFT transition, unlike before this sprint (was an empty terminal state)", () => {
    expect(ALLOWED_TENDER_TRANSITIONS.ARCHIVED).toEqual(["DRAFT"]);
  });
});

describe("canOfferCandidateChange (mirror of Tender.CANDIDATE_CHANGE_ALLOWED_STATUSES)", () => {
  it("offers the change only for DRAFT and IN_ANALYSIS", () => {
    expect(canOfferCandidateChange("DRAFT")).toBe(true);
    expect(canOfferCandidateChange("IN_ANALYSIS")).toBe(true);
    expect(canOfferCandidateChange("READY")).toBe(false);
    expect(canOfferCandidateChange("ARCHIVED")).toBe(false);
  });
});

describe("canChangeTenderCandidate", () => {
  it("mirrors the same role gate as canChangeTenderStatus (display-only, backend revalidates)", () => {
    expect(canChangeTenderCandidate("OWNER")).toBe(true);
    expect(canChangeTenderCandidate("BID_MANAGER")).toBe(true);
    expect(canChangeTenderCandidate("READ_ONLY")).toBe(false);
    expect(canChangeTenderCandidate(undefined)).toBe(false);
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
