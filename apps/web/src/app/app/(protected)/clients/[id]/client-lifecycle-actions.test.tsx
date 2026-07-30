import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClientLifecycleActions } from "./client-lifecycle-actions";
import type { ClientAccountSummary } from "../../../../../lib/client-portfolio-types";

const archiveClientAccountAction = vi.fn(async (_clientId: string) => ({}));
const restoreClientAccountAction = vi.fn(async (_clientId: string) => ({}));
const deleteClientAccountAction = vi.fn(async (_clientId: string) => ({}));

vi.mock("../../../client-portfolio-actions", () => ({
  archiveClientAccountAction: (clientId: string) => archiveClientAccountAction(clientId),
  restoreClientAccountAction: (clientId: string) => restoreClientAccountAction(clientId),
  deleteClientAccountAction: (clientId: string) => deleteClientAccountAction(clientId),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const activeClient = { id: "client-1", status: "ACTIVE" } as ClientAccountSummary;
const archivedClient = { id: "client-1", status: "ARCHIVED" } as ClientAccountSummary;

describe("ClientLifecycleActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires a confirmation step before archiving an ACTIVE client", async () => {
    const user = userEvent.setup();
    render(<ClientLifecycleActions client={activeClient} canDelete={false} />);

    await user.click(screen.getByRole("button", { name: "Archiver" }));
    expect(archiveClientAccountAction).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Confirmer" }));
    expect(archiveClientAccountAction).toHaveBeenCalledWith("client-1");
  });

  it("shows Restaurer for an archived client and calls restoreClientAccountAction on click", async () => {
    const user = userEvent.setup();
    render(<ClientLifecycleActions client={archivedClient} canDelete={false} />);

    await user.click(screen.getByRole("button", { name: "Restaurer" }));

    expect(restoreClientAccountAction).toHaveBeenCalledWith("client-1");
  });

  it("never shows a delete option for a non-archived client", () => {
    render(<ClientLifecycleActions client={activeClient} canDelete={true} />);
    expect(screen.queryByRole("button", { name: "Supprimer définitivement" })).not.toBeInTheDocument();
  });

  it("requires typing SUPPRIMER before the permanent delete button is enabled", async () => {
    const user = userEvent.setup();
    render(<ClientLifecycleActions client={archivedClient} canDelete={true} />);

    await user.click(screen.getByRole("button", { name: "Supprimer définitivement" }));
    const confirmButton = screen.getByRole("button", { name: "Confirmer la suppression" });
    expect(confirmButton).toBeDisabled();

    await user.type(screen.getByRole("textbox"), "SUPPRIMER");
    expect(confirmButton).toBeEnabled();

    await user.click(confirmButton);
    expect(deleteClientAccountAction).toHaveBeenCalledWith("client-1");
  });
});
