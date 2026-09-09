import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CreateTenderForm } from "./create-tender-form";
import type { ClientAccountSummary } from "../../../../../lib/client-portfolio-types";
import type { CandidateCompanySummary } from "../../../../../lib/candidate-company-types";

vi.mock("../../../actions", () => ({
  createTenderAction: vi.fn(async (_prevState: unknown, _formData: FormData) => ({ error: "Le titre est obligatoire." })),
  createBuyerAction: vi.fn(() => vi.fn(async (_prevState: unknown, _formData: FormData) => ({}))),
}));

const CLIENTS: ClientAccountSummary[] = [
  { id: "client-1", organizationId: "org-1", name: "Acme Corp", status: "ACTIVE", createdBy: "user-1", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
];

/** Checkpoint CCV2-G.1 — l'entreprise candidate est desormais obligatoire a la creation. */
const CANDIDATES: CandidateCompanySummary[] = [
  { id: "candidate-alpha", organizationId: "org-1", name: "Alpha", legalName: "ALPHA SAS", status: "ACTIVE", createdBy: "user-1", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
  { id: "candidate-beta", organizationId: "org-1", name: "Beta", legalName: "BETA SARL", status: "ACTIVE", createdBy: "user-1", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
];

describe("CreateTenderForm", () => {
  it("BLOQUANT (CCV2-G.1) — l'entreprise candidate est un champ OBLIGATOIRE, distinct du client, et rien n'est pre-selectionne", () => {
    render(<CreateTenderForm clients={CLIENTS} buyers={[]} candidateCompanies={CANDIDATES} />);

    const selector = screen.getByLabelText("Entreprise candidate *");
    expect(selector).toBeRequired();
    // Aucune valeur par defaut : le produit ne devine jamais l'entite juridique qui candidate.
    expect((selector as HTMLSelectElement).value).toBe("");
    // L'utilisateur voit une raison sociale, jamais un identifiant technique.
    expect(screen.getByRole("option", { name: "ALPHA SAS" })).toBeInTheDocument();
    expect(screen.queryByText("candidate-alpha")).not.toBeInTheDocument();
    // Le champ CLIENT reste un champ distinct — les deux notions ne sont jamais fusionnees.
    expect(screen.getByLabelText("Client *")).not.toBe(selector);
  });

  it("renders the mandatory title field and the submit button", () => {
    render(<CreateTenderForm clients={CLIENTS} buyers={[]} candidateCompanies={CANDIDATES} />);

    expect(screen.getByLabelText("Client *")).toBeRequired();
    expect(screen.getByLabelText("Titre *")).toBeRequired();
    expect(screen.getByRole("button", { name: "Creer l'appel d'offres" })).toBeInTheDocument();
  });

  it("renders the optional fields described by the mission (reference, buyer, procedure, amounts, deadline)", () => {
    render(<CreateTenderForm clients={CLIENTS} buyers={[]} candidateCompanies={CANDIDATES} />);

    expect(screen.getByLabelText("Reference")).toBeInTheDocument();
    expect(screen.getByLabelText("Acheteur (texte libre)")).toBeInTheDocument();
    expect(screen.getByLabelText("Type de procedure")).toBeInTheDocument();
    expect(screen.getByLabelText("Type de marche *")).toBeInTheDocument();
    expect(screen.getByLabelText("Montant estime")).toBeInTheDocument();
    expect(screen.getByLabelText("Date limite de remise")).toBeInTheDocument();
  });

  it("renders the mandatory business fields required by the backend contract (country, language, currency, source)", () => {
    render(<CreateTenderForm clients={CLIENTS} buyers={[]} candidateCompanies={CANDIDATES} />);

    expect(screen.getByLabelText("Pays *")).toBeInTheDocument();
    expect(screen.getByLabelText("Langue *")).toBeInTheDocument();
    expect(screen.getByLabelText("Devise *")).toBeInTheDocument();
    expect(screen.getByLabelText("Source")).toBeInTheDocument();
  });

  it("initializes the standard manual-creation-in-France defaults: FR / fr / EUR / MANUAL / PUBLIC", () => {
    render(<CreateTenderForm clients={CLIENTS} buyers={[]} candidateCompanies={CANDIDATES} />);

    expect(screen.getByLabelText("Pays *")).toHaveValue("FR");
    expect(screen.getByLabelText("Langue *")).toHaveValue("fr");
    expect(screen.getByLabelText("Devise *")).toHaveValue("EUR");
    expect(screen.getByLabelText("Type de marche *")).toHaveValue("PUBLIC");
    expect(screen.getByLabelText("Source")).toHaveValue("MANUAL");
  });

  it("keeps the Source field read-only, pre-filled to MANUAL, and never submits any input named source", () => {
    // Correction securite : la source est fixee en dur cote serveur (createTenderAction), jamais
    // lue depuis le formulaire — aucun input, meme cache, ne doit porter ce nom.
    const { container } = render(<CreateTenderForm clients={CLIENTS} buyers={[]} candidateCompanies={CANDIDATES} />);

    expect(screen.getByLabelText("Source")).toBeDisabled();
    expect(container.querySelector('[name="source"]')).toBeNull();
  });

  it("displays the backend validation error message returned by the server action", async () => {
    render(<CreateTenderForm clients={CLIENTS} buyers={[]} candidateCompanies={CANDIDATES} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Titre *"), "x");
    // Checkpoint TENDEROS-2.1-CCV2-G.1 — l'entreprise candidate est desormais OBLIGATOIRE : sans
    // selection, le formulaire ne se soumet meme pas et l'action serveur n'est jamais atteinte.
    // Ce test porte sur l'affichage de l'erreur BACKEND, il doit donc franchir cette etape.
    await user.selectOptions(screen.getByLabelText("Entreprise candidate *"), "candidate-alpha");
    await user.click(screen.getByRole("button", { name: "Creer l'appel d'offres" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Le titre est obligatoire.");
  });

  /**
   * Checkpoint TENDEROS-2.1-CCV2-G.1 (POLICY A) — l'interface ne doit jamais laisser partir une
   * creation sans entreprise candidate. Le backend reste l'autorite (preuve HTTP separee), mais
   * l'utilisateur ne doit pas decouvrir la regle par un 400 apres avoir rempli tout le formulaire.
   */
  it("BLOQUANT (CCV2-G.1) — sans entreprise candidate selectionnee, la soumission n'atteint jamais l'action serveur", async () => {
    render(<CreateTenderForm clients={CLIENTS} buyers={[]} candidateCompanies={CANDIDATES} />);
    const user = userEvent.setup();

    const select = screen.getByLabelText("Entreprise candidate *");
    expect(select).toBeRequired();
    // Aucune valeur pre-selectionnee : le produit ne devine pas le candidat.
    expect(select).toHaveValue("");

    await user.type(screen.getByLabelText("Titre *"), "Marche sans candidat");
    await user.click(screen.getByRole("button", { name: "Creer l'appel d'offres" }));

    // L'action serveur (mockee) n'a pas ete appelee : aucune alerte d'erreur backend n'apparait.
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
