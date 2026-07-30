import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CreateKnowledgeEntryForm } from "./create-knowledge-entry-form";

vi.mock("../../../knowledge-actions", () => ({
  createKnowledgeEntryAction: vi.fn(async (_prevState: unknown, _formData: FormData) => ({ error: "Le titre est obligatoire." })),
}));

describe("CreateKnowledgeEntryForm", () => {
  it("renders the mandatory fields (title, category) and the submit button", () => {
    render(<CreateKnowledgeEntryForm clients={[]} />);

    expect(screen.getByLabelText("Titre *")).toBeRequired();
    expect(screen.getByLabelText("Catégorie *")).toBeRequired();
    expect(screen.getByRole("button", { name: "Créer l'entrée" })).toBeInTheDocument();
  });

  it("shows no category-specific metadata fields by default (category OTHER)", () => {
    render(<CreateKnowledgeEntryForm clients={[]} />);

    expect(screen.queryByLabelText("Nom du client")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Nom complet")).not.toBeInTheDocument();
  });

  it("reveals CLIENT_REFERENCE metadata fields when that category is selected", async () => {
    const user = userEvent.setup();
    render(<CreateKnowledgeEntryForm clients={[]} />);

    await user.selectOptions(screen.getByLabelText("Catégorie *"), "CLIENT_REFERENCE");

    expect(screen.getByLabelText("Nom du client")).toBeInTheDocument();
    expect(screen.getByLabelText("Devise (ex. EUR)")).toBeInTheDocument();
  });

  it("reveals CONSULTANT_PROFILE metadata fields when that category is selected", async () => {
    const user = userEvent.setup();
    render(<CreateKnowledgeEntryForm clients={[]} />);

    await user.selectOptions(screen.getByLabelText("Catégorie *"), "CONSULTANT_PROFILE");

    expect(screen.getByLabelText("Nom complet")).toBeInTheDocument();
    expect(screen.getByLabelText("Années d'expérience")).toBeInTheDocument();
  });
});
