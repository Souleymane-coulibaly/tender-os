import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgeLifecycleActions } from "./knowledge-lifecycle-actions";
import type { KnowledgeEntrySummary } from "../../../../../lib/knowledge-types";

const archiveKnowledgeEntryAction = vi.fn(async (_entryId: string) => ({}));
const restoreKnowledgeEntryAction = vi.fn(async (_entryId: string) => ({}));
const deleteKnowledgeEntryAction = vi.fn(async (_entryId: string) => ({}));

vi.mock("../../../knowledge-actions", () => ({
  archiveKnowledgeEntryAction: (entryId: string) => archiveKnowledgeEntryAction(entryId),
  restoreKnowledgeEntryAction: (entryId: string) => restoreKnowledgeEntryAction(entryId),
  deleteKnowledgeEntryAction: (entryId: string) => deleteKnowledgeEntryAction(entryId),
}));

const readyEntry = { id: "entry-1", status: "READY" } as KnowledgeEntrySummary;
const archivedEntry = { id: "entry-1", status: "ARCHIVED" } as KnowledgeEntrySummary;

describe("KnowledgeLifecycleActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires a confirmation step before archiving a READY entry", async () => {
    const user = userEvent.setup();
    render(<KnowledgeLifecycleActions entry={readyEntry} canDelete={false} />);

    await user.click(screen.getByRole("button", { name: "Archiver" }));
    expect(archiveKnowledgeEntryAction).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Confirmer" }));
    expect(archiveKnowledgeEntryAction).toHaveBeenCalledWith("entry-1");
  });

  it("shows Restaurer for an archived entry and calls restoreKnowledgeEntryAction on click", async () => {
    const user = userEvent.setup();
    render(<KnowledgeLifecycleActions entry={archivedEntry} canDelete={false} />);

    await user.click(screen.getByRole("button", { name: "Restaurer" }));

    expect(restoreKnowledgeEntryAction).toHaveBeenCalledWith("entry-1");
  });

  it("never shows a delete option when the actor lacks delete permission", () => {
    render(<KnowledgeLifecycleActions entry={archivedEntry} canDelete={false} />);
    expect(screen.queryByRole("button", { name: "Supprimer définitivement" })).not.toBeInTheDocument();
  });

  it("requires typing SUPPRIMER before the permanent delete button is enabled", async () => {
    const user = userEvent.setup();
    render(<KnowledgeLifecycleActions entry={archivedEntry} canDelete={true} />);

    await user.click(screen.getByRole("button", { name: "Supprimer définitivement" }));
    const confirmButton = screen.getByRole("button", { name: "Confirmer la suppression" });
    expect(confirmButton).toBeDisabled();

    await user.type(screen.getByRole("textbox"), "SUPPRIMER");
    expect(confirmButton).toBeEnabled();

    await user.click(confirmButton);
    expect(deleteKnowledgeEntryAction).toHaveBeenCalledWith("entry-1");
  });

  it("never permanently deletes a non-archived entry (no delete button while READY)", () => {
    render(<KnowledgeLifecycleActions entry={readyEntry} canDelete={true} />);
    expect(screen.queryByRole("button", { name: "Supprimer définitivement" })).not.toBeInTheDocument();
  });
});
