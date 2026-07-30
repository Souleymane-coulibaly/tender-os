import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CreateClientAccountForm } from "./create-client-account-form";

vi.mock("../../../client-portfolio-actions", () => ({
  createClientAccountAction: vi.fn(async (_prevState: unknown, _formData: FormData) => ({ error: "Le nom du client est obligatoire." })),
}));

describe("CreateClientAccountForm", () => {
  it("renders the mandatory name field and the submit button", () => {
    render(<CreateClientAccountForm />);

    expect(screen.getByLabelText("Nom *")).toBeRequired();
    expect(screen.getByRole("button", { name: "Créer le client" })).toBeInTheDocument();
  });

  it("renders the optional fields described by the mission (legal name, reference, sector, country, website, address, notes)", () => {
    render(<CreateClientAccountForm />);

    expect(screen.getByLabelText("Raison sociale")).toBeInTheDocument();
    expect(screen.getByLabelText("Référence interne")).toBeInTheDocument();
    expect(screen.getByLabelText("Secteur")).toBeInTheDocument();
    expect(screen.getByLabelText("Pays")).toBeInTheDocument();
    expect(screen.getByLabelText("Site web")).toBeInTheDocument();
    expect(screen.getByLabelText("Adresse")).toBeInTheDocument();
    expect(screen.getByLabelText("Notes")).toBeInTheDocument();
  });

  it("defaults the initial status to ACTIVE, never ARCHIVED", () => {
    render(<CreateClientAccountForm />);

    expect(screen.getByLabelText("Statut initial")).toHaveValue("ACTIVE");
    expect(screen.queryByRole("option", { name: "Archivé" })).not.toBeInTheDocument();
  });

  it("displays the backend validation error message returned by the server action", async () => {
    render(<CreateClientAccountForm />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Nom *"), "x");
    await user.click(screen.getByRole("button", { name: "Créer le client" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Le nom du client est obligatoire.");
  });
});
