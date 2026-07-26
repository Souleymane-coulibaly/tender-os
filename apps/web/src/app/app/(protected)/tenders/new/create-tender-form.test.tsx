import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CreateTenderForm } from "./create-tender-form";

vi.mock("../../../actions", () => ({
  createTenderAction: vi.fn(async (_prevState: unknown, _formData: FormData) => ({ error: "Le titre est obligatoire." })),
}));

describe("CreateTenderForm", () => {
  it("renders the mandatory title field and the submit button", () => {
    render(<CreateTenderForm />);

    expect(screen.getByLabelText("Titre *")).toBeRequired();
    expect(screen.getByRole("button", { name: "Creer l'appel d'offres" })).toBeInTheDocument();
  });

  it("renders the optional fields described by the mission (reference, buyer, procedure, amounts, deadline)", () => {
    render(<CreateTenderForm />);

    expect(screen.getByLabelText("Reference")).toBeInTheDocument();
    expect(screen.getByLabelText("Acheteur")).toBeInTheDocument();
    expect(screen.getByLabelText("Type de procedure")).toBeInTheDocument();
    expect(screen.getByLabelText("Type de marche")).toBeInTheDocument();
    expect(screen.getByLabelText("Montant estime")).toBeInTheDocument();
    expect(screen.getByLabelText("Date limite de remise")).toBeInTheDocument();
  });
});
