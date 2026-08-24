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
    render(
      <AppShell headerActions={null} actorRole="OWNER">
        Contenu
      </AppShell>,
    );

    const logo = screen.getByAltText("TenderOS");
    expect(logo.tagName).toBe("IMG");
    expect(logo).toHaveAttribute("src", "/brand/tenderos-logo-horizontal-dark.svg");
  });

  it("marks the current section's nav item as active via aria-current", () => {
    render(
      <AppShell headerActions={null} actorRole="OWNER">
        Contenu
      </AppShell>,
    );
    expect(screen.getByRole("link", { name: "Appels d'offres" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Opportunités" })).not.toHaveAttribute("aria-current");
  });

  it("renders the page content and the supplied header actions", () => {
    render(
      <AppShell headerActions={<button type="button">Se déconnecter</button>} actorRole="OWNER">
        Contenu de la page
      </AppShell>,
    );
    expect(screen.getByText("Contenu de la page")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Se déconnecter" })).toBeInTheDocument();
  });

  /** Checkpoint TENDEROS-2.1-P2.3-E6 (mission §16/§17) — la nav ne doit jamais mener un rôle sans
   *  accès vers un état "Accès refusé" plein écran (Intégrations : `IntegrationPermission.Read`
   *  restreint à OWNER/ORGANIZATION_ADMIN côté backend, confirmé par
   *  `ai-benchmark-http.integration.spec.ts`/`integration-permission.ts`). Un rôle sans accès à un
   *  item filtré doit tout de même voir les items non filtrés de la même section (jamais une
   *  section entière masquée par erreur).
   *
   *  Checkpoint TENDEROS-2.1-P2.3-E7 — "Membres" est désormais filtré aussi : preuve HTTP+PostgreSQL
   *  réelle (`organization-memberships-authorization-http.integration.spec.ts`) que
   *  `OrganizationPermission.MemberList` est restreint à OWNER/ORGANIZATION_ADMIN, un angle mort d'E6
   *  jamais vérifié à l'époque (voir `nav-sections.ts`). */
  it("BLOQUANT — hides Intégrations AND Membres for a CONTRIBUTOR (backend denies even read access to both) while keeping the rest of Paramètres visible", () => {
    render(
      <AppShell headerActions={null} actorRole="CONTRIBUTOR">
        Contenu
      </AppShell>,
    );
    expect(screen.queryByRole("link", { name: "Intégrations" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Membres" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Abonnement & utilisation" })).toBeInTheDocument();
  });

  it("shows Intégrations and Membres for OWNER/ORGANIZATION_ADMIN", () => {
    render(
      <AppShell headerActions={null} actorRole="ORGANIZATION_ADMIN">
        Contenu
      </AppShell>,
    );
    expect(screen.getByRole("link", { name: "Intégrations" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Membres" })).toBeInTheDocument();
  });

  it("hides Veille for READ_ONLY/EXTERNAL_CONSULTANT (mirrors canUseMarketWatch, already used at page level)", () => {
    render(
      <AppShell headerActions={null} actorRole="READ_ONLY">
        Contenu
      </AppShell>,
    );
    expect(screen.queryByRole("link", { name: "Veille" })).not.toBeInTheDocument();
  });
});
