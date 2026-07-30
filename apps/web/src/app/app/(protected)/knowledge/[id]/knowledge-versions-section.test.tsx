import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgeVersionsSection } from "./knowledge-versions-section";
import type { KnowledgeEntryVersionSummary } from "../../../../../lib/knowledge-types";

const restoreKnowledgeVersionAction = vi.fn(async (_entryId: string, _versionNumber: number) => ({}));

vi.mock("../../../knowledge-actions", () => ({
  restoreKnowledgeVersionAction: (entryId: string, versionNumber: number) => restoreKnowledgeVersionAction(entryId, versionNumber),
}));

const versions: KnowledgeEntryVersionSummary[] = [
  { id: "v1", knowledgeEntryId: "entry-1", versionNumber: 1, snapshot: {}, createdByUserId: "user-1", createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "v2", knowledgeEntryId: "entry-1", versionNumber: 2, snapshot: {}, createdByUserId: "user-1", createdAt: "2026-01-02T00:00:00.000Z" },
];

describe("KnowledgeVersionsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks the highest version number as active and never offers to restore it", () => {
    render(<KnowledgeVersionsSection entryId="entry-1" initialVersions={versions} canRestore={true} />);

    expect(screen.getByText("active")).toBeInTheDocument();
    // Une seule version restaurable (v1) : v2 est active, jamais de bouton "Restaurer" pour elle-même.
    expect(screen.getAllByRole("button", { name: "Restaurer" })).toHaveLength(1);
  });

  it("restores an older version on click", async () => {
    const user = userEvent.setup();
    render(<KnowledgeVersionsSection entryId="entry-1" initialVersions={versions} canRestore={true} />);

    await user.click(screen.getByRole("button", { name: "Restaurer" }));

    expect(restoreKnowledgeVersionAction).toHaveBeenCalledWith("entry-1", 1);
  });

  it("hides the restore action entirely when the actor cannot restore", () => {
    render(<KnowledgeVersionsSection entryId="entry-1" initialVersions={versions} canRestore={false} />);
    expect(screen.queryByRole("button", { name: "Restaurer" })).not.toBeInTheDocument();
  });
});
