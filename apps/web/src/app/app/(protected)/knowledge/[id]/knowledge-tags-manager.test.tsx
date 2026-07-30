import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgeTagsManager } from "./knowledge-tags-manager";
import type { KnowledgeTagSummary } from "../../../../../lib/knowledge-types";

const addKnowledgeTagAction = vi.fn(async (_entryId: string, _label: string) => ({}));
const removeKnowledgeTagAction = vi.fn(async (_entryId: string, _tagId: string) => ({}));

vi.mock("../../../knowledge-actions", () => ({
  addKnowledgeTagAction: (entryId: string, label: string) => addKnowledgeTagAction(entryId, label),
  removeKnowledgeTagAction: (entryId: string, tagId: string) => removeKnowledgeTagAction(entryId, tagId),
}));

const tags: KnowledgeTagSummary[] = [{ id: "tag-1", label: "cloud", displayLabel: "Cloud", createdAt: "2026-01-01T00:00:00.000Z" }];

describe("KnowledgeTagsManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows existing tags", () => {
    render(<KnowledgeTagsManager entryId="entry-1" tags={tags} canManage={true} />);
    expect(screen.getByText("Cloud")).toBeInTheDocument();
  });

  it("adds a tag by typing a label and clicking Ajouter", async () => {
    const user = userEvent.setup();
    render(<KnowledgeTagsManager entryId="entry-1" tags={[]} canManage={true} />);

    await user.type(screen.getByLabelText("Nouveau tag"), "azure");
    await user.click(screen.getByRole("button", { name: "Ajouter" }));

    expect(addKnowledgeTagAction).toHaveBeenCalledWith("entry-1", "azure");
  });

  it("removes a tag when its remove button is clicked", async () => {
    const user = userEvent.setup();
    render(<KnowledgeTagsManager entryId="entry-1" tags={tags} canManage={true} />);

    await user.click(screen.getByRole("button", { name: "Retirer le tag Cloud" }));

    expect(removeKnowledgeTagAction).toHaveBeenCalledWith("entry-1", "tag-1");
  });

  it("hides add/remove controls when the actor cannot manage tags", () => {
    render(<KnowledgeTagsManager entryId="entry-1" tags={tags} canManage={false} />);
    expect(screen.queryByLabelText("Nouveau tag")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retirer le tag Cloud" })).not.toBeInTheDocument();
  });
});
