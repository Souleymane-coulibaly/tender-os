import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PlatformApiError } from "../../../lib/platform-api-client";
import { ApiErrorState } from "./api-error-state";

describe("ApiErrorState", () => {
  it("renders an access-denied message for a 403 error", () => {
    render(<ApiErrorState error={new PlatformApiError(403, "PLATFORM_CAPABILITY_MISSING", "Missing capability")} />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Vos droits d'administration ne permettent pas cette action.");
    expect(alert).not.toHaveTextContent("Missing capability");
  });

  it("renders a French access-denied message for a 403 whose code is unknown, never the raw message", () => {
    render(<ApiErrorState error={new PlatformApiError(403, "SOME_FUTURE_CODE", "Raw backend text")} />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Accès refusé");
    expect(alert).not.toHaveTextContent("Raw backend text");
  });

  it("renders a session-expired message for a 401 error", () => {
    render(<ApiErrorState error={new PlatformApiError(401, "AUTHENTICATION_REQUIRED", "No session")} />);

    expect(screen.getByRole("alert")).toHaveTextContent("session a expiré");
  });

  it("renders a generic message for an unexpected error", () => {
    render(<ApiErrorState error={new Error("boom")} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Une erreur inattendue est survenue.");
  });
});
