import { describe, expect, it } from "vitest";
import { TenderArchivedError } from "../../domain/errors";
import { TenderId } from "../../domain/tender-id.value-object";
import { Tender } from "../../domain/tender.aggregate";
import { TenderStatus } from "../../domain/tender-status";
import { assertTenderNotArchivedForLotMutation } from "./tender-lot-mutation.policy";

function createTender(): Tender {
  return Tender.create({
    id: TenderId.from("tender-1"),
    organizationId: "org-1",
    clientAccountId: "client-1",
    title: "Marche de travaux",
    createdBy: "user-1",
    occurredAt: new Date(),
  });
}

describe("assertTenderNotArchivedForLotMutation", () => {
  it("does not throw for a non-archived tender", () => {
    const tender = createTender();

    expect(() => assertTenderNotArchivedForLotMutation(tender)).not.toThrow();
  });

  it("throws TenderArchivedError when the tender is archived", () => {
    const tender = createTender();
    tender.changeStatus(TenderStatus.Archived, new Date());

    expect(() => assertTenderNotArchivedForLotMutation(tender)).toThrow(TenderArchivedError);
  });
});
