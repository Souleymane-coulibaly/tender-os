import { describe, expect, it } from "vitest";
import {
  InvalidTenderAmountRangeError,
  InvalidTenderEstimatedAmountError,
  InvalidTenderStatusTransitionError,
  TenderArchivedError,
  TenderCandidateChangeNotAllowedError,
} from "./errors";
import { Tender } from "./tender.aggregate";
import { TenderId } from "./tender-id.value-object";
import { TenderStatus } from "./tender-status";

function createTender(overrides: Partial<Parameters<typeof Tender.create>[0]> = {}): Tender {
  return Tender.create({
    id: TenderId.from("tender-1"),
    organizationId: "org-1",
    clientAccountId: "client-1",
    title: "Marché de fournitures",
    createdBy: "user-1",
    occurredAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
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

  it("refuses any transition out of ARCHIVED other than the restore-to-DRAFT path (V2 Sprint 3 §7/§29)", () => {
    const tender = createTender();
    tender.changeStatus(TenderStatus.Archived, new Date());

    expect(() => tender.changeStatus(TenderStatus.Won, new Date())).toThrow(
      InvalidTenderStatusTransitionError,
    );
  });

  it("restores an archived tender to DRAFT and clears archivedAt (V2 Sprint 3 §7/§29 — correctif de la restauration)", () => {
    const tender = createTender();
    tender.changeStatus(TenderStatus.Archived, new Date("2026-03-01T00:00:00Z"));

    tender.changeStatus(TenderStatus.Draft, new Date("2026-03-02T00:00:00Z"));

    expect(tender.status).toBe(TenderStatus.Draft);
    expect(tender.archivedAt).toBeUndefined();
  });
});

describe("Tender#changeClientAccount (V2 Sprint 3 §4)", () => {
  it("changes the candidate while the tender is still DRAFT and bumps version/updatedAt", () => {
    const tender = createTender();

    tender.changeClientAccount("client-2", new Date("2026-02-01T00:00:00Z"));

    expect(tender.clientAccountId).toBe("client-2");
    expect(tender.version).toBe(2);
    expect(tender.updatedAt).toEqual(new Date("2026-02-01T00:00:00Z"));
  });

  it("still allows the change while IN_ANALYSIS", () => {
    const tender = createTender();
    tender.changeStatus(TenderStatus.InAnalysis, new Date());

    tender.changeClientAccount("client-2", new Date());

    expect(tender.clientAccountId).toBe("client-2");
  });

  it("refuses the change once the tender has moved past IN_ANALYSIS (response preparation started)", () => {
    const tender = createTender();
    tender.changeStatus(TenderStatus.InAnalysis, new Date());
    tender.changeStatus(TenderStatus.Ready, new Date());

    expect(() => tender.changeClientAccount("client-2", new Date())).toThrow(TenderCandidateChangeNotAllowedError);
  });

  it("refuses the change on an archived tender", () => {
    const tender = createTender();
    tender.changeStatus(TenderStatus.Archived, new Date());

    expect(() => tender.changeClientAccount("client-2", new Date())).toThrow(TenderArchivedError);
  });
});

describe("Tender amounts — correction audit Codex P1 (montants non validés)", () => {
  it("refuses a non-numeric estimatedAmount at creation, never persists it silently", () => {
    expect(() => createTender({ estimatedAmount: "not-a-number" })).toThrow(InvalidTenderEstimatedAmountError);
  });

  it("refuses a non-numeric minimumAmount/maximumAmount at creation", () => {
    expect(() => createTender({ minimumAmount: "abc" })).toThrow(InvalidTenderEstimatedAmountError);
    expect(() => createTender({ maximumAmount: "abc" })).toThrow(InvalidTenderEstimatedAmountError);
  });

  it("refuses minimumAmount > maximumAmount at creation", () => {
    expect(() => createTender({ minimumAmount: "600000", maximumAmount: "400000" })).toThrow(InvalidTenderAmountRangeError);
  });

  it("accepts minimumAmount <= maximumAmount at creation", () => {
    const tender = createTender({ minimumAmount: "400000", maximumAmount: "600000" });
    expect(tender.minimumAmount).toBe("400000");
    expect(tender.maximumAmount).toBe("600000");
  });

  it("refuses a non-numeric amount via updateDetails", () => {
    const tender = createTender();
    expect(() => tender.updateDetails({ estimatedAmount: "not-a-number" }, new Date())).toThrow(InvalidTenderEstimatedAmountError);
  });

  it("refuses updateDetails when the resulting range is inconsistent, even if only one bound is touched", () => {
    const tender = createTender({ minimumAmount: "400000", maximumAmount: "600000" });

    expect(() => tender.updateDetails({ minimumAmount: "700000" }, new Date())).toThrow(InvalidTenderAmountRangeError);
  });
});
