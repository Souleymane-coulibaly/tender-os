import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PlatformApiError } from "../../../lib/platform-api-client";
import { ApiErrorState } from "./api-error-state";

describe("ApiErrorState", () => {
  it("renders an access-denied message for a 403 error", () => {
    render(<ApiErrorState error={new PlatformApiError(403, "PLATFORM_CAPABILITY_MISSING", "Missing capability")} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Accès refusé");
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
