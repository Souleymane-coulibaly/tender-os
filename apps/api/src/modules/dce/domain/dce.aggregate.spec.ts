import { describe, expect, it } from "vitest";
import { DceId } from "./dce-id.value-object";
import { DceStatus } from "./dce-status";
import { Dce } from "./dce.aggregate";

const NOW = new Date("2026-07-27T00:00:00Z");

function createDce(): Dce {
  return Dce.create({
    id: DceId.from("dce-1"),
    organizationId: "org-1",
    tenderId: "tender-1",
    createdByUserId: "user-1",
    occurredAt: NOW,
  });
}

describe("Dce aggregate", () => {
  it("starts DRAFT", () => {
    const dce = createDce();

    expect(dce.status).toBe(DceStatus.Draft);
    expect(dce.organizationId).toBe("org-1");
    expect(dce.tenderId).toBe("tender-1");
  });

  it("transitions to IMPORTED and bumps updatedAt", () => {
    const dce = createDce();
    const later = new Date("2026-07-28T00:00:00Z");

    dce.markImported(later);

    expect(dce.status).toBe(DceStatus.Imported);
    expect(dce.updatedAt).toBe(later);
  });

  it("is idempotent: marking an already-IMPORTED DCE again does not throw or move updatedAt", () => {
    const dce = createDce();
    const firstImport = new Date("2026-07-28T00:00:00Z");
    const secondImport = new Date("2026-07-29T00:00:00Z");

    dce.markImported(firstImport);
    dce.markImported(secondImport);

    expect(dce.status).toBe(DceStatus.Imported);
    expect(dce.updatedAt).toBe(firstImport);
  });

  it("rehydrates from persisted props without altering them", () => {
    const dce = Dce.rehydrate({
      id: DceId.from("dce-2"),
      organizationId: "org-1",
      tenderId: "tender-2",
      status: DceStatus.Imported,
      revision: 3,
      createdByUserId: "user-1",
      createdAt: NOW,
      updatedAt: NOW,
    });

    expect(dce.status).toBe(DceStatus.Imported);
    expect(dce.id.value).toBe("dce-2");
    expect(dce.revision).toBe(3);
  });

  it("BLOQUANT (Checkpoint 2.1-P2.1-FIX-A) — a freshly created Dce starts at revision 1, a meaningful baseline never confused with 'no revision tracked'", () => {
    const dce = createDce();

    expect(dce.revision).toBe(1);
  });
});
