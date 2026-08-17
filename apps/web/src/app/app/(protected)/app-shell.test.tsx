import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "./app-shell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/tenders",
}));

/**
 * Design System Checkpoint C — régression pour le correctif "vrai logo" (mission §25) : avant ce
 * Checkpoint, la sidebar rendait le texte brut "TenderOS" au lieu de l'asset de marque réel utilisé
 * par la Landing (`site-header.tsx`/`site-footer.tsx`). Ce test verrouille le retour en arrière.
 */
describe("AppShell", () => {
  it("BLOQUANT — renders the real TenderOS brand SVG asset in the sidebar, never a plain text wordmark", () => {
    render(<AppShell headerActions={null}>Contenu</AppShell>);

    const logo = screen.getByAltText("TenderOS");
    expect(logo.tagName).toBe("IMG");
    expect(logo).toHaveAttribute("src", "/brand/tenderos-logo-horizontal-dark.svg");
  });

  it("marks the current section's nav item as active via aria-current", () => {
    render(<AppShell headerActions={null}>Contenu</AppShell>);
    expect(screen.getByRole("link", { name: "Appels d'offres" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Opportunités" })).not.toHaveAttribute("aria-current");
  });

  it("renders the page content and the supplied header actions", () => {
    render(<AppShell headerActions={<button type="button">Se déconnecter</button>}>Contenu de la page</AppShell>);
    expect(screen.getByText("Contenu de la page")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Se déconnecter" })).toBeInTheDocument();
  });
});
