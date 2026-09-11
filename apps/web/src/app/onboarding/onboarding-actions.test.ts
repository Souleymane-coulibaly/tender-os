import { beforeEach, describe, expect, it, vi } from "vitest";
import { API_ERROR_MESSAGES } from "../../lib/api-error-messages";

const redirectMock = vi.fn();
const appApiFetchMock = vi.fn();

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("../app/billing-actions", () => ({ createCheckoutSessionAction: vi.fn() }));

class FakeAppApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppApiError";
  }
}

vi.mock("../../lib/app-api-client", () => ({
  APP_SESSION_COOKIE: "tenderos_app_session",
  APP_ORGANIZATION_COOKIE: "tenderos_app_organization_id",
  AppApiError: FakeAppApiError,
  appApiFetch: appApiFetchMock,
  appApiFetchWithToken: vi.fn(),
}));

const { createOrganizationAction } = await import("./onboarding-actions");

function companyForm(name = "Entreprise Test"): FormData {
  const formData = new FormData();
  formData.set("name", name);
  return formData;
}

/**
 * Étape « Entreprise » : l'échec de création d'organisation affichait un message unique pour toute
 * cause (« Impossible de créer l'organisation. Réessayez. ») — refus de l'API comme API injoignable.
 * Ces tests fixent un message exact par cause.
 */
describe("createOrganizationAction — messages d'échec", () => {
  beforeEach(() => {
    appApiFetchMock.mockReset();
    redirectMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("dit la cause d'un refus de l'API par son code, jamais un message générique", async () => {
    appApiFetchMock.mockRejectedValue(new FakeAppApiError(422, "INVALID_ORGANIZATION_SLUG", "Invalid slug."));

    const result = await createOrganizationAction({}, companyForm());

    expect(result.error).toBe(API_ERROR_MESSAGES.INVALID_ORGANIZATION_SLUG);
    expect(result.error).not.toContain("Invalid slug");
  });

  it("dit qu'une panne serveur est une panne serveur", async () => {
    appApiFetchMock.mockRejectedValue(new FakeAppApiError(503, "SOME_UNKNOWN_CODE", "Service unavailable"));

    const result = await createOrganizationAction({}, companyForm());

    expect(result.error).toBe("Une erreur serveur est survenue. Veuillez réessayer.");
  });

  it("ne présente jamais une API injoignable comme une saisie refusée", async () => {
    appApiFetchMock.mockRejectedValue(new TypeError("fetch failed"));

    const result = await createOrganizationAction({}, companyForm());

    expect(result.error).toBe("Le service TenderOS est momentanément injoignable. Réessayez dans un instant.");
  });

  it("renvoie à l'étape « Compte » quand la session a expiré", async () => {
    appApiFetchMock.mockRejectedValue(new FakeAppApiError(401, "AUTHENTICATION_REQUIRED", "No session"));

    await createOrganizationAction({}, companyForm());

    expect(redirectMock).toHaveBeenCalledWith(expect.stringMatching(/^\/onboarding\/compte/));
  });

  it("refuse un nom vide avant tout appel à l'API", async () => {
    const result = await createOrganizationAction({}, companyForm("   "));

    expect(result.error).toBe("Le nom de l'entreprise est obligatoire.");
    expect(appApiFetchMock).not.toHaveBeenCalled();
  });
});
