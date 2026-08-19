import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CreateCandidateCompanyForm } from "./create-candidate-company-form";

vi.mock("../../../candidate-company-actions", () => ({
  createCandidateCompanyAction: vi.fn(async (_prevState: unknown, _formData: FormData) => ({ error: "Le nom est obligatoire." })),
}));

/**
 * Checkpoint 2.1-A5 (correctif audit — réserve P2) — première preuve frontend que la création
 * d'une CandidateCompany (mission §14, jamais démontrée par un test avant ce correctif) fonctionne.
 */
describe("CreateCandidateCompanyForm", () => {
  it("renders the mandatory name field and the submit button", () => {
    render(<CreateCandidateCompanyForm />);

    expect(screen.getByLabelText("Nom")).toBeRequired();
    expect(screen.getByRole("button", { name: "Créer l'entreprise candidate" })).toBeInTheDocument();
  });

  it("renders the identity fields described by the mission (raison sociale, SIREN, forme juridique, TVA) — never certifications/assurances/références (mission §14 'n'afficher que ce qui est réellement supporté')", () => {
    render(<CreateCandidateCompanyForm />);

    expect(screen.getByLabelText("Raison sociale")).toBeInTheDocument();
    expect(screen.getByLabelText("SIREN")).toBeInTheDocument();
    expect(screen.getByLabelText("Forme juridique")).toBeInTheDocument();
    expect(screen.getByLabelText("Numéro de TVA intracommunautaire")).toBeInTheDocument();
    expect(screen.queryByLabelText(/certification/i)).not.toBeInTheDocument();
  });

  it("displays the backend validation error message returned by the server action", async () => {
    render(<CreateCandidateCompanyForm />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Nom"), "x");
    await user.click(screen.getByRole("button", { name: "Créer l'entreprise candidate" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Le nom est obligatoire.");
  });
});
