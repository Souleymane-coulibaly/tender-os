import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AddEstablishmentForm } from "./add-establishment-form";

const addCandidateEstablishmentAction = vi.fn(async (_candidateCompanyId: string, _prevState: unknown, _formData: FormData) => ({}) as { error?: string });

vi.mock("../../../candidate-company-actions", () => ({
  addCandidateEstablishmentAction: (candidateCompanyId: string, prevState: unknown, formData: FormData) => addCandidateEstablishmentAction(candidateCompanyId, prevState, formData),
}));

/**
 * Checkpoint 2.1-A5 (correctif audit — réserve P2) — preuve frontend de l'ajout d'un établissement
 * CandidateCompany (mission §14), jamais démontrée par un test avant ce correctif.
 */
describe("AddEstablishmentForm", () => {
  it("renders the mandatory SIRET field and the submit button", () => {
    render(<AddEstablishmentForm candidateCompanyId="candidate-1" />);

    expect(screen.getByLabelText("SIRET")).toBeRequired();
    expect(screen.getByRole("button", { name: "Ajouter l'établissement" })).toBeInTheDocument();
  });

  it("submitting calls addCandidateEstablishmentAction bound to the correct CandidateCompany id", async () => {
    const user = userEvent.setup();
    render(<AddEstablishmentForm candidateCompanyId="candidate-1" />);

    await user.type(screen.getByLabelText("SIRET"), "35600000000048");
    await user.click(screen.getByRole("button", { name: "Ajouter l'établissement" }));

    expect(addCandidateEstablishmentAction).toHaveBeenCalledWith("candidate-1", {}, expect.any(FormData));
  });

  it("displays the backend error returned by the server action (e.g. an invalid SIRET checksum, never validated client-side)", async () => {
    addCandidateEstablishmentAction.mockResolvedValueOnce({ error: "Certains champs sont invalides (vérifiez le SIREN/SIRET)." });
    const user = userEvent.setup();
    render(<AddEstablishmentForm candidateCompanyId="candidate-1" />);

    await user.type(screen.getByLabelText("SIRET"), "12345678901234");
    await user.click(screen.getByRole("button", { name: "Ajouter l'établissement" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Certains champs sont invalides");
  });
});
