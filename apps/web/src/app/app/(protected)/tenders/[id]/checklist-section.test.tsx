import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChecklistSection } from "./checklist-section";
import type { ChecklistItem } from "../../../../../lib/tenders-types";

const changeChecklistItemStatusAction = vi.fn(async (_tenderId: string, _itemId: string, _status: string) => ({}));

vi.mock("../../../actions", () => ({
  createChecklistItemAction: {
    bind: () => vi.fn(async (_prevState: unknown, _formData: FormData) => ({})),
  },
  changeChecklistItemStatusAction: (tenderId: string, itemId: string, status: string) =>
    changeChecklistItemStatusAction(tenderId, itemId, status),
}));

const ITEMS: ChecklistItem[] = [
  { id: "item-1", tenderId: "tender-1", title: "Fournir attestation", required: true, status: "TODO", displayOrder: 1 },
];

describe("ChecklistSection", () => {
  it("shows an empty state when there are no checklist items", () => {
    render(<ChecklistSection tenderId="tender-1" items={[]} />);

    expect(screen.getByText("Aucun element de checklist.")).toBeInTheDocument();
  });

  it("lists existing items and lets the status be changed", async () => {
    const user = userEvent.setup();
    render(<ChecklistSection tenderId="tender-1" items={ITEMS} />);

    expect(screen.getByText("Fournir attestation")).toBeInTheDocument();

    await user.selectOptions(screen.getByDisplayValue("A faire"), "COMPLETED");

    expect(changeChecklistItemStatusAction).toHaveBeenCalledWith("tender-1", "item-1", "COMPLETED");
  });

  it("has an inline form to add a new checklist item", () => {
    render(<ChecklistSection tenderId="tender-1" items={[]} />);

    expect(screen.getByPlaceholderText("Nouvel element...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ajouter" })).toBeInTheDocument();
  });
});
