import { describe, expect, it } from "vitest";
import type { TenderSummary } from "../../../tenders";
import { TenderArchivedForDceMutationError } from "../../domain/errors";
import { assertTenderNotArchivedForDceMutation } from "./dce-tender-mutation.policy";

function fakeTenderSummary(overrides: Partial<TenderSummary> = {}): TenderSummary {
  return {
    id: "tender-1",
    organizationId: "org-1",
    clientAccountId: "client-1",
    title: "Marche de travaux",
    status: "DRAFT",
    tags: [],
    createdBy: "user-1",
    createdAt: "2026-07-27T00:00:00.000Z",
    updatedAt: "2026-07-27T00:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

describe("assertTenderNotArchivedForDceMutation", () => {
  it("does not throw for a non-archived tender", () => {
    expect(() => assertTenderNotArchivedForDceMutation(fakeTenderSummary())).not.toThrow();
  });

  it("throws TenderArchivedForDceMutationError when archivedAt is set", () => {
    const tender = fakeTenderSummary({ status: "ARCHIVED", archivedAt: "2026-07-27T00:00:00.000Z" });

    expect(() => assertTenderNotArchivedForDceMutation(tender)).toThrow(TenderArchivedForDceMutationError);
  });
});
