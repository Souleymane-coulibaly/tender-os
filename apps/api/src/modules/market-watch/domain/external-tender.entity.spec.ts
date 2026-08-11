import { describe, expect, it } from "vitest";
import { ExternalTender } from "./external-tender.entity";

const NOW = new Date("2026-06-01T00:00:00.000Z");

function buildTender() {
  return ExternalTender.create({
    id: "et-1",
    organizationId: "org-1",
    source: "BOAMP",
    marketType: "PUBLIC",
    externalId: "15-27549",
    title: "Fourniture de pièces détachées",
    cpvCodes: ["34300000"],
    occurredAt: NOW,
  });
}

describe("ExternalTender — mission §8/§10/§12", () => {
  it("computes a checksum at creation", () => {
    const tender = buildTender();
    expect(tender.checksum).toBeTruthy();
  });

  it("BLOQUANT — mission §12: applyFetch with identical normalized fields is NOT a significant update", () => {
    const tender = buildTender();
    const changed = tender.applyFetch({ marketType: "PUBLIC", title: "Fourniture de pièces détachées", cpvCodes: ["34300000"], occurredAt: new Date("2026-06-02T00:00:00.000Z") });
    expect(changed).toBe(false);
  });

  it("BLOQUANT — mission §12: applyFetch with a changed deadline IS a significant update", () => {
    const tender = buildTender();
    const changed = tender.applyFetch({ marketType: "PUBLIC", title: "Fourniture de pièces détachées", cpvCodes: ["34300000"], submissionDeadline: new Date("2026-07-01T00:00:00.000Z"), occurredAt: new Date("2026-06-02T00:00:00.000Z") });
    expect(changed).toBe(true);
    expect(tender.submissionDeadline).toEqual(new Date("2026-07-01T00:00:00.000Z"));
  });

  it("applyFetch always refreshes lastFetchedAt, even when unchanged", () => {
    const tender = buildTender();
    const laterFetch = new Date("2026-06-03T00:00:00.000Z");
    tender.applyFetch({ marketType: "PUBLIC", title: "Fourniture de pièces détachées", cpvCodes: ["34300000"], occurredAt: laterFetch });
    expect(tender.lastFetchedAt).toEqual(laterFetch);
  });
});
