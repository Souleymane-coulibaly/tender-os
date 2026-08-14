import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { readStoredConsent } from "../../lib/consent";
import { ConsentProvider } from "./consent-provider";
import { CookieBanner } from "./cookie-banner";
import { CookieSettingsModal } from "./cookie-settings-modal";

function renderConsentUi() {
  return render(
    <ConsentProvider>
      <CookieBanner />
      <CookieSettingsModal />
    </ConsentProvider>,
  );
}

describe("Cookie consent flow", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("V2 Sprint 23 (landing, mission §58) — shows the banner on first visit", () => {
    renderConsentUi();

    expect(screen.getByText("Votre confidentialité compte")).toBeInTheDocument();
  });

  it("mission §60 — 'Tout accepter' grants analytics and support and hides the banner", () => {
    renderConsentUi();

    fireEvent.click(screen.getByRole("button", { name: "Tout accepter" }));

    expect(screen.queryByText("Votre confidentialité compte")).not.toBeInTheDocument();
    expect(readStoredConsent()).toMatchObject({ analytics: true, support: true });
  });

  it("mission §59 — 'Tout refuser' is exactly as accessible as 'Tout accepter' and grants nothing", () => {
    renderConsentUi();

    const rejectButton = screen.getByRole("button", { name: "Tout refuser" });
    expect(rejectButton).toBeVisible();
    fireEvent.click(rejectButton);

    expect(readStoredConsent()).toMatchObject({ analytics: false, support: false });
  });

  it("mission §61 — custom preferences (Analytics ON, Support OFF) are respected independently", () => {
    renderConsentUi();

    fireEvent.click(screen.getByRole("button", { name: "Personnaliser" }));
    fireEvent.click(screen.getByLabelText("Autoriser la mesure d'audience"));
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer mes choix" }));

    expect(readStoredConsent()).toMatchObject({ analytics: true, support: false });
  });

  it("mission §43 — never a cookie wall: navigation content is not gated by the banner's presence", () => {
    renderConsentUi();
    // Le banner est un overlay `fixed`, jamais un blocage plein écran empêchant l'interaction
    // avec le reste de la page (pas de backdrop opaque, pas de `pointer-events: none` global).
    expect(document.body.style.overflow).not.toBe("hidden");
  });
});
