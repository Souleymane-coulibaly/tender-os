import { describe, expect, it } from "vitest";
import { ChecklistItem, ChecklistItemStatus } from "./checklist-item.entity";

function createItem(): ChecklistItem {
  return ChecklistItem.create({
    id: "item-1",
    organizationId: "org-1",
    tenderId: "tender-1",
    title: "Fournir l'attestation",
    required: true,
    occurredAt: new Date("2026-01-01T00:00:00Z"),
  });
}

describe("ChecklistItem#changeStatus", () => {
  it("records completedAt/completedBy when marked COMPLETED", () => {
    const item = createItem();

    item.changeStatus(ChecklistItemStatus.Completed, "user-1", new Date("2026-02-01T00:00:00Z"));

    expect(item.completedAt).toEqual(new Date("2026-02-01T00:00:00Z"));
    expect(item.completedBy).toBe("user-1");
  });

  it("clears completedAt/completedBy when moved back to a non-completed status", () => {
    const item = createItem();
    item.changeStatus(ChecklistItemStatus.Completed, "user-1", new Date());

    item.changeStatus(ChecklistItemStatus.InProgress, undefined, new Date());

    expect(item.completedAt).toBeUndefined();
    expect(item.completedBy).toBeUndefined();
  });
});
