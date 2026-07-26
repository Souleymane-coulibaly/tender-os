import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LifecycleActions } from "./lifecycle-actions";
import type { DocumentSummary } from "../../../../../lib/documents-types";

const archiveDocumentAction = vi.fn(async (_documentId: string) => ({}));
const restoreDocumentAction = vi.fn(async (_documentId: string) => ({}));
const deleteDocumentAction = vi.fn(async (_documentId: string) => undefined);

vi.mock("../../../documents-actions", () => ({
  archiveDocumentAction: (documentId: string) => archiveDocumentAction(documentId),
  restoreDocumentAction: (documentId: string) => restoreDocumentAction(documentId),
  deleteDocumentAction: (documentId: string) => deleteDocumentAction(documentId),
}));

const activeDocument = { id: "doc-1", status: "ACTIVE" } as DocumentSummary;
const archivedDocument = { id: "doc-1", status: "ARCHIVED" } as DocumentSummary;

describe("LifecycleActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows Archiver for an active document and calls archiveDocumentAction on click", async () => {
    const user = userEvent.setup();
    render(<LifecycleActions doc={activeDocument} />);

    await user.click(screen.getByRole("button", { name: "Archiver" }));

    expect(archiveDocumentAction).toHaveBeenCalledWith("doc-1");
  });

  it("shows Restaurer for an archived document and calls restoreDocumentAction on click", async () => {
    const user = userEvent.setup();
    render(<LifecycleActions doc={archivedDocument} />);

    await user.click(screen.getByRole("button", { name: "Restaurer" }));

    expect(restoreDocumentAction).toHaveBeenCalledWith("doc-1");
  });

  it("requires a confirmation step before calling deleteDocumentAction", async () => {
    const user = userEvent.setup();
    render(<LifecycleActions doc={activeDocument} />);

    await user.click(screen.getByRole("button", { name: "Supprimer" }));
    expect(deleteDocumentAction).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Confirmer" }));
    expect(deleteDocumentAction).toHaveBeenCalledWith("doc-1");
  });

  it("cancels the delete confirmation without calling deleteDocumentAction", async () => {
    const user = userEvent.setup();
    render(<LifecycleActions doc={activeDocument} />);

    await user.click(screen.getByRole("button", { name: "Supprimer" }));
    await user.click(screen.getByRole("button", { name: "Annuler" }));

    expect(screen.getByRole("button", { name: "Supprimer" })).toBeInTheDocument();
    expect(deleteDocumentAction).not.toHaveBeenCalled();
  });
});
