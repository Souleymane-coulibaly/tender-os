import { describe, expect, it } from "vitest";
import { InvalidTenderStatusTransitionError, TenderArchivedError } from "./errors";
import { Tender } from "./tender.aggregate";
import { TenderId } from "./tender-id.value-object";
import { TenderStatus } from "./tender-status";

function createTender(): Tender {
  return Tender.create({
    id: TenderId.from("tender-1"),
    organizationId: "org-1",
    title: "Marché de fournitures",
    createdBy: "user-1",
    occurredAt: new Date("2026-01-01T00:00:00Z"),
  });
}

describe("Tender.create", () => {
  it("starts in DRAFT with version 1", () => {
    const tender = createTender();

    expect(tender.status).toBe(TenderStatus.Draft);
    expect(tender.version).toBe(1);
    expect(tender.archivedAt).toBeUndefined();
  });
});

describe("Tender#updateDetails", () => {
  it("applies only the provided fields and bumps version/updatedAt", () => {
    const tender = createTender();

    tender.updateDetails({ title: "Marché renommé" }, new Date("2026-02-01T00:00:00Z"));

    expect(tender.title).toBe("Marché renommé");
    expect(tender.version).toBe(2);
    expect(tender.updatedAt).toEqual(new Date("2026-02-01T00:00:00Z"));
  });

  it("refuses to update an archived tender", () => {
    const tender = createTender();
    tender.changeStatus(TenderStatus.Archived, new Date());

    expect(() => tender.updateDetails({ title: "x" }, new Date())).toThrow(TenderArchivedError);
  });
});

describe("Tender#changeStatus", () => {
  it("follows the documented funnel DRAFT -> IN_ANALYSIS -> READY -> IN_PREPARATION -> READY_TO_SUBMIT -> SUBMITTED", () => {
    const tender = createTender();

    tender.changeStatus(TenderStatus.InAnalysis, new Date());
    tender.changeStatus(TenderStatus.Ready, new Date());
    tender.changeStatus(TenderStatus.InPreparation, new Date());
    tender.changeStatus(TenderStatus.ReadyToSubmit, new Date());
    tender.changeStatus(TenderStatus.Submitted, new Date());

    expect(tender.status).toBe(TenderStatus.Submitted);
  });

  it("refuses to jump straight to SUBMITTED from DRAFT", () => {
    const tender = createTender();

    expect(() => tender.changeStatus(TenderStatus.Submitted, new Date())).toThrow(
      InvalidTenderStatusTransitionError,
    );
  });

  it("reaches WON only from SUBMITTED", () => {
    const tender = createTender();

    expect(() => tender.changeStatus(TenderStatus.Won, new Date())).toThrow(
      InvalidTenderStatusTransitionError,
    );
  });

  it("sets archivedAt when transitioning to ARCHIVED", () => {
    const tender = createTender();

    tender.changeStatus(TenderStatus.Archived, new Date("2026-03-01T00:00:00Z"));

    expect(tender.status).toBe(TenderStatus.Archived);
    expect(tender.archivedAt).toEqual(new Date("2026-03-01T00:00:00Z"));
  });

  it("refuses any transition out of ARCHIVED", () => {
    const tender = createTender();
    tender.changeStatus(TenderStatus.Archived, new Date());

    expect(() => tender.changeStatus(TenderStatus.Draft, new Date())).toThrow(
      InvalidTenderStatusTransitionError,
    );
  });
});
