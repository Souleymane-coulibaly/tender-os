import { describe, expect, it } from "vitest";
import { AppApiError } from "./app-api-client";
import { apiErrorMessage, describeApiError } from "./api-error-messages";

function apiError(status: number, code: string, message = "Raw backend message in English.") {
  return new AppApiError(status, code, message);
}

describe("apiErrorMessage", () => {
  it("donne le message français d'un code connu", () => {
    expect(apiErrorMessage(apiError(404, "TENDER_NOT_FOUND"))).toBe("Cet appel d'offres est introuvable.");
  });

  it("renvoie undefined pour un code inconnu : l'appelant garde son propre repli", () => {
    expect(apiErrorMessage(apiError(409, "SOME_FUTURE_CODE"))).toBeUndefined();
  });

  it("reconnaît aussi les erreurs du back-office plateforme, par leur forme", () => {
    expect(apiErrorMessage({ status: 403, code: "FORBIDDEN", message: "x" })).toBe("Vous n'avez pas les droits nécessaires pour cette action.");
  });

  it("ignore ce qui n'est pas une erreur API", () => {
    expect(apiErrorMessage(new Error("réseau"))).toBeUndefined();
    expect(apiErrorMessage(undefined)).toBeUndefined();
  });
});

describe("describeApiError", () => {
  it("préfère le message du code", () => {
    expect(describeApiError(apiError(409, "TENDER_ARCHIVED"))).toBe("Cet appel d'offres est archivé : il ne peut plus être modifié.");
  });

  it("se replie sur le statut HTTP pour un code inconnu — jamais sur le message brut de l'API", () => {
    const message = describeApiError(apiError(404, "SOME_FUTURE_CODE", "Widget not found."));
    expect(message).toBe("L'élément demandé est introuvable.");
    expect(message).not.toContain("Widget");
  });

  it("donne un message serveur générique pour toute erreur 5xx inconnue", () => {
    expect(describeApiError(apiError(503, "SOME_FUTURE_CODE"))).toBe("Une erreur serveur est survenue. Veuillez réessayer.");
  });

  it("utilise le repli fourni pour un statut sans message dédié, et pour une erreur non API", () => {
    expect(describeApiError(apiError(418, "SOME_FUTURE_CODE"), "Impossible d'enregistrer.")).toBe("Impossible d'enregistrer.");
    expect(describeApiError(new Error("réseau"), "Impossible d'enregistrer.")).toBe("Impossible d'enregistrer.");
  });
});
