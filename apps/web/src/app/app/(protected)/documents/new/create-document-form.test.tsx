import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CreateDocumentForm } from "./create-document-form";

vi.mock("../../../documents-actions", () => ({
  createDocumentAction: vi.fn(async (_prevState: unknown, _formData: FormData) => ({ error: "Le titre est obligatoire." })),
}));

describe("CreateDocumentForm", () => {
  it("renders the mandatory fields (title, origin, domain, file) and the submit button", () => {
    render(<CreateDocumentForm />);

    expect(screen.getByLabelText("Titre *")).toBeRequired();
    expect(screen.getByLabelText("Origine *")).toBeRequired();
    expect(screen.getByLabelText("Domaine *")).toBeRequired();
    expect(screen.getByLabelText("Fichier *")).toBeRequired();
    expect(screen.getByRole("button", { name: "Déposer le document" })).toBeInTheDocument();
  });

  it("renders a free-text category field with suggestions, never a constrained select", () => {
    render(<CreateDocumentForm />);

    const category = screen.getByLabelText("Catégorie");
    expect(category.tagName).toBe("INPUT");
    expect(category).toHaveAttribute("list", "category-suggestions");
  });
});
