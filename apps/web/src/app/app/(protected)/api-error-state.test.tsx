import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppApiError } from "../../../lib/app-api-client";
import { ApiErrorState } from "./api-error-state";

/**
 * Écran d'erreur des pages de l'espace organisation. « Une erreur inattendue est survenue. »
 * s'affichait pour toute erreur qui n'était pas une instance d'`AppApiError` — y compris un vrai
 * refus de l'API venu d'un module dupliqué par Next.js et une API simplement injoignable — sans
 * rien journaliser. Ces tests fixent un message exact par cause.
 */
describe("ApiErrorState (espace organisation)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("dit la cause d'un refus de l'API par son code", () => {
    render(<ApiErrorState error={new AppApiError(404, "TENDER_NOT_FOUND", "Tender not found.")} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Cet appel d'offres est introuvable.");
  });

  it("reconnaît une erreur d'API par sa forme, même hors instance de classe (module dupliqué)", () => {
    render(<ApiErrorState error={{ status: 403, code: "FORBIDDEN", message: "Forbidden" }} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Accès refusé");
  });

  it("dit que le service est injoignable quand l'API n'a pas répondu du tout", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<ApiErrorState error={new TypeError("fetch failed")} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Le service TenderOS est momentanément injoignable.");
  });

  it("journalise côté serveur toute erreur inattendue, jamais un écran muet", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const bug = new Error("Cannot read properties of undefined");
    render(<ApiErrorState error={bug} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Une erreur inattendue est survenue.");
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("Page data load failed"), bug);
  });
});
