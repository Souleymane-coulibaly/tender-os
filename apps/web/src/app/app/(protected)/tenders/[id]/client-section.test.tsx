import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ClientSection } from "./client-section";

const changeTenderClientAction = vi.fn(async (_tenderId: string, _prevState: unknown, _formData: FormData) => ({}) as { error?: string });

vi.mock("../../../actions", () => ({
  changeTenderClientAction: (tenderId: string, prevState: unknown, formData: FormData) => changeTenderClientAction(tenderId, prevState, formData),
}));

const otherClients = [{ id: "client-b", name: "Client B" }];

/**
 * Checkpoint 2.1-A5 (correctif audit — réserve P2) — `ClientSection` (renommé depuis
 * `CandidateSection`) n'avait jamais eu de test dédié. Preuve qu'il gère bien le CLIENT
 * (ClientAccount), jamais présenté comme "entreprise candidate" (voir CandidateCompanySection,
 * mission §11 — les deux concepts doivent rester visuellement et fonctionnellement distincts).
 */
describe("ClientSection", () => {
  it("BLOQUANT (mission §11) — labels itself 'Client', never 'Entreprise candidate', and shows the current client's name", () => {
    render(<ClientSection tenderId="tender-1" status="DRAFT" currentClientAccountId="client-a" currentClientName="Client A" accessibleClients={[{ id: "client-a", name: "Client A" }]} canChange={false} />);

    expect(screen.getByText("Client")).toBeInTheDocument();
    expect(screen.getByText("Client A")).toBeInTheDocument();
    expect(screen.queryByText("Entreprise candidate")).not.toBeInTheDocument();
  });

  it("offers a change control when canChange, status allows it, and another client is accessible — submitting calls the dedicated client action bound to this tender", async () => {
    const user = userEvent.setup();
    render(
      <ClientSection
        tenderId="tender-1"
        status="DRAFT"
        currentClientAccountId="client-a"
        currentClientName="Client A"
        accessibleClients={[{ id: "client-a", name: "Client A" }, ...otherClients]}
        canChange={true}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Changer de client" }));
    await user.selectOptions(screen.getByLabelText("Nouveau client"), "client-b");
    await user.click(screen.getByRole("button", { name: "Confirmer le changement" }));

    expect(changeTenderClientAction).toHaveBeenCalledWith("tender-1", {}, expect.any(FormData));
  });

  it("never offers a change control when canChange is false", () => {
    render(
      <ClientSection
        tenderId="tender-1"
        status="DRAFT"
        currentClientAccountId="client-a"
        currentClientName="Client A"
        accessibleClients={[{ id: "client-a", name: "Client A" }, ...otherClients]}
        canChange={false}
      />,
    );

    expect(screen.queryByRole("button", { name: "Changer de client" })).not.toBeInTheDocument();
  });
});
