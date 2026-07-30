import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    expect(screen.getByLabelText("Type de marche *")).toBeInTheDocument();
    expect(screen.getByLabelText("Montant estime")).toBeInTheDocument();
    expect(screen.getByLabelText("Date limite de remise")).toBeInTheDocument();
  });

  it("renders the mandatory business fields required by the backend contract (country, language, currency, source)", () => {
    render(<CreateTenderForm />);

    expect(screen.getByLabelText("Pays *")).toBeInTheDocument();
    expect(screen.getByLabelText("Langue *")).toBeInTheDocument();
    expect(screen.getByLabelText("Devise *")).toBeInTheDocument();
    expect(screen.getByLabelText("Source")).toBeInTheDocument();
  });

  it("initializes the standard manual-creation-in-France defaults: FR / fr / EUR / MANUAL / PUBLIC", () => {
    render(<CreateTenderForm />);

    expect(screen.getByLabelText("Pays *")).toHaveValue("FR");
    expect(screen.getByLabelText("Langue *")).toHaveValue("fr");
    expect(screen.getByLabelText("Devise *")).toHaveValue("EUR");
    expect(screen.getByLabelText("Type de marche *")).toHaveValue("PUBLIC");
    expect(screen.getByLabelText("Source")).toHaveValue("MANUAL");
  });

  it("keeps the Source field read-only, pre-filled to MANUAL, and never submits any input named source", () => {
    // Correction securite : la source est fixee en dur cote serveur (createTenderAction), jamais
    // lue depuis le formulaire — aucun input, meme cache, ne doit porter ce nom.
    const { container } = render(<CreateTenderForm />);

    expect(screen.getByLabelText("Source")).toBeDisabled();
    expect(container.querySelector('[name="source"]')).toBeNull();
  });

  it("displays the backend validation error message returned by the server action", async () => {
    render(<CreateTenderForm />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Titre *"), "x");
    await user.click(screen.getByRole("button", { name: "Creer l'appel d'offres" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Le titre est obligatoire.");
  });
});
