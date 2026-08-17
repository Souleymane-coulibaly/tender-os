import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./button";

describe("Button", () => {
  it("renders a native button by default, disabled when loading", () => {
    render(<Button loading>Enregistrer</Button>);
    const button = screen.getByRole("button", { name: "Enregistrer" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    // Le contenu reste dans le DOM (jamais de layout-shift) — juste masqué visuellement.
    expect(screen.getByText("Enregistrer")).toBeInTheDocument();
  });

  it("is enabled and not aria-busy when not loading", () => {
    render(<Button>Enregistrer</Button>);
    const button = screen.getByRole("button", { name: "Enregistrer" });
    expect(button).not.toBeDisabled();
    expect(button).not.toHaveAttribute("aria-busy");
  });

  it("BLOQUANT — renders a link (not a button) when href is provided, never mixing navigation and submission", () => {
    render(<Button href="/app/tenders">Voir les appels d'offres</Button>);
    const link = screen.getByRole("link", { name: "Voir les appels d'offres" });
    expect(link).toHaveAttribute("href", "/app/tenders");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("applies the variant's own classes — primary/outline/link stay visually distinct", () => {
    const { rerender } = render(<Button variant="primary">Go</Button>);
    expect(screen.getByRole("button")).toHaveClass("bg-tenderos-navy");

    rerender(<Button variant="outline">Go</Button>);
    expect(screen.getByRole("button")).toHaveClass("border-tenderos-navy");

    rerender(<Button variant="link">Go</Button>);
    expect(screen.getByRole("button")).toHaveClass("text-tenderos-blue");
  });
});
