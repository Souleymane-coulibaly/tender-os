import { beforeEach, describe, expect, it, vi } from "vitest";

const cookiesMock = vi.fn();
const redirectMock = vi.fn();
const revalidatePathMock = vi.fn();
const appApiFetchMock = vi.fn();

vi.mock("next/headers", () => ({ cookies: cookiesMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

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

const { createTenderAction, updateTenderAction } = await import("./actions");

/**
 * Couvre le contrat reel entre le formulaire Tender et l'API (mission "Corrige uniquement l'ecran
 * de creation et d'edition d'un appel d'offres") — teste directement les server actions plutot
 * que le seul rendu DOM : c'est ici que le payload envoye a l'API est construit et valide.
 */
describe("createTenderAction", () => {
  beforeEach(() => {
    appApiFetchMock.mockReset();
    redirectMock.mockReset();
    revalidatePathMock.mockReset();
  });

  function buildValidFormData(overrides: Record<string, string> = {}): FormData {
    const data: Record<string, string> = {
      clientAccountId: "client-1",
      title: "Maintenance et support informatique",
      reference: "AO-2026-001",
      buyerName: "Mairie de Lyon",
      procedureType: "OPEN",
      marketType: "PUBLIC",
      estimatedAmount: "50000",
      submissionDeadline: "2026-09-30",
      country: "FR",
      language: "fr",
      currency: "EUR",
      source: "MANUAL",
      ...overrides,
    };
    const formData = new FormData();
    for (const [key, value] of Object.entries(data)) {
      formData.set(key, value);
    }
    return formData;
  }

  it("sends a complete, strictly-conformant payload (amount as string, date as full ISO datetime)", async () => {
    appApiFetchMock.mockResolvedValue({ id: "tender-1" });

    await createTenderAction({}, buildValidFormData());

    expect(appApiFetchMock).toHaveBeenCalledWith("/api/v1/tenders", expect.objectContaining({ method: "POST" }));
    const call = appApiFetchMock.mock.calls[0]!;
    const sentBody = JSON.parse((call[1] as { body: string }).body) as Record<string, unknown>;
    expect(sentBody).toEqual({
      clientAccountId: "client-1",
      title: "Maintenance et support informatique",
      reference: "AO-2026-001",
      buyerName: "Mairie de Lyon",
      procedureType: "OPEN",
      marketType: "PUBLIC",
      country: "FR",
      language: "fr",
      currency: "EUR",
      source: "MANUAL",
      estimatedAmount: "50000",
      submissionDeadline: "2026-09-30T00:00:00.000Z",
    });
    // mission §25.92 — `?created=1` est un signal volontaire (voir actions.ts), consommé une seule
    // fois par `FirstTenderTracker` pour déclencher l'événement analytics "first_tender_started"
    // puis nettoyé de l'URL côté client — jamais un paramètre accidentel.
    expect(redirectMock).toHaveBeenCalledWith("/app/tenders/tender-1?created=1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/tenders");
  });

  it("never sends an undefined value for an omitted optional field (JSON.stringify already drops it, this proves it)", async () => {
    appApiFetchMock.mockResolvedValue({ id: "tender-1" });

    await createTenderAction({}, buildValidFormData({ reference: "" }));

    const call = appApiFetchMock.mock.calls[0]!;
    const sentBody = JSON.parse((call[1] as { body: string }).body) as Record<string, unknown>;
    expect("reference" in sentBody).toBe(false);
  });

  it("rejects a missing mandatory field (title) before ever calling the API", async () => {
    const result = await createTenderAction({}, buildValidFormData({ title: "" }));

    expect(result.error).toBe("Le titre est obligatoire.");
    expect(appApiFetchMock).not.toHaveBeenCalled();
  });

  it("rejects a missing client (mission Sprint 5.1 — un client autorisé est obligatoire) before ever calling the API", async () => {
    const result = await createTenderAction({}, buildValidFormData({ clientAccountId: "" }));

    expect(result.error).toBe("Le client est obligatoire.");
    expect(appApiFetchMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid enum value (marketType) before ever calling the API", async () => {
    const result = await createTenderAction({}, buildValidFormData({ marketType: "OUVERT" }));

    expect(result.error).toBe("Type de marche invalide.");
    expect(appApiFetchMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid estimated amount (non-numeric) before ever calling the API", async () => {
    const result = await createTenderAction({}, buildValidFormData({ estimatedAmount: "50 000,00 euros" }));

    expect(result.error).toContain("Montant estime invalide");
    expect(appApiFetchMock).not.toHaveBeenCalled();
  });

  it("rejects a non-positive estimated amount", async () => {
    const result = await createTenderAction({}, buildValidFormData({ estimatedAmount: "0" }));

    expect(result.error).toContain("Montant estime invalide");
    expect(appApiFetchMock).not.toHaveBeenCalled();
  });

  it("maps a 400 API response to a comprehensible French message, never 'Unexpected error'", async () => {
    appApiFetchMock.mockRejectedValue(new FakeAppApiError(400, "VALIDATION_FAILED", "The request contains invalid fields."));

    const result = await createTenderAction({}, buildValidFormData());

    expect(result.error).toBe("Certains champs de l'appel d'offres sont invalides.");
    expect(result.error).not.toContain("Unexpected error");
  });

  it("maps a 403 API response to a comprehensible French message", async () => {
    appApiFetchMock.mockRejectedValue(new FakeAppApiError(403, "TENDER_PERMISSION_MISSING", "Missing permission: tender:create."));

    const result = await createTenderAction({}, buildValidFormData());

    expect(result.error).toBe("Vous n'avez pas les droits necessaires pour cette action.");
  });

  it("SECURITY: ignores a falsified source=TED in FormData and always sends MANUAL", async () => {
    appApiFetchMock.mockResolvedValue({ id: "tender-1" });

    // Simule une requete forgee (devtools, formulaire modifie) : le champ "source" disabled cote
    // UI n'empeche en rien un client malveillant de soumettre n'importe quelle valeur.
    await createTenderAction({}, buildValidFormData({ source: "TED" }));

    const call = appApiFetchMock.mock.calls[0]!;
    const sentBody = JSON.parse((call[1] as { body: string }).body) as Record<string, unknown>;
    expect(sentBody.source).toBe("MANUAL");
    expect(sentBody.source).not.toBe("TED");
  });
});

describe("updateTenderAction", () => {
  beforeEach(() => {
    appApiFetchMock.mockReset();
    revalidatePathMock.mockReset();
  });

  function buildEditFormData(overrides: Record<string, string> = {}): FormData {
    const data: Record<string, string> = {
      title: "Maintenance et support informatique (v2)",
      reference: "AO-2026-001",
      buyerName: "Mairie de Lyon",
      procedureType: "OPEN",
      marketType: "PUBLIC",
      estimatedAmount: "75000",
      submissionDeadline: "2026-10-15",
      country: "FR",
      language: "fr",
      currency: "EUR",
      source: "MANUAL",
      ...overrides,
    };
    const formData = new FormData();
    for (const [key, value] of Object.entries(data)) {
      formData.set(key, value);
    }
    return formData;
  }

  it("sends every field currently displayed by the edit form, preserving values unchanged by the user", async () => {
    appApiFetchMock.mockResolvedValue(undefined);

    await updateTenderAction("tender-1", {}, buildEditFormData());

    expect(appApiFetchMock).toHaveBeenCalledWith(
      "/api/v1/tenders/tender-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          title: "Maintenance et support informatique (v2)",
          description: undefined,
          reference: "AO-2026-001",
          buyerName: "Mairie de Lyon",
          procedureType: "OPEN",
          marketType: "PUBLIC",
          country: "FR",
          language: "fr",
          currency: "EUR",
          estimatedAmount: "75000",
          submissionDeadline: "2026-10-15T00:00:00.000Z",
        }),
      }),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/tenders/tender-1");
  });

  it("never overwrites marketType/country/language/currency with undefined (always resubmitted from the prefilled form)", async () => {
    appApiFetchMock.mockResolvedValue(undefined);

    await updateTenderAction("tender-1", {}, buildEditFormData());

    const call = appApiFetchMock.mock.calls[0]!;
    const sentBody = JSON.parse((call[1] as { body: string }).body) as Record<string, unknown>;
    expect(sentBody.marketType).toBe("PUBLIC");
    expect(sentBody.country).toBe("FR");
    expect(sentBody.language).toBe("fr");
    expect(sentBody.currency).toBe("EUR");
  });

  it("SECURITY: never sends a source field at all, even when FormData is falsified with source=TED (backend keeps the existing source unchanged)", async () => {
    appApiFetchMock.mockResolvedValue(undefined);

    await updateTenderAction("tender-1", {}, buildEditFormData({ source: "TED" }));

    const call = appApiFetchMock.mock.calls[0]!;
    const sentBody = JSON.parse((call[1] as { body: string }).body) as Record<string, unknown>;
    expect("source" in sentBody).toBe(false);
    expect(JSON.stringify(sentBody)).not.toContain("TED");
  });

  it("rejects a missing mandatory field (title) before ever calling the API", async () => {
    const result = await updateTenderAction("tender-1", {}, buildEditFormData({ title: "" }));

    expect(result.error).toBe("Le titre est obligatoire.");
    expect(appApiFetchMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid enum value (country) before ever calling the API", async () => {
    const result = await updateTenderAction("tender-1", {}, buildEditFormData({ country: "US" }));

    expect(result.error).toBe("Pays invalide.");
    expect(appApiFetchMock).not.toHaveBeenCalled();
  });
});
