import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePathMock = vi.fn();
const appApiFetchMock = vi.fn();

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
  AppApiError: FakeAppApiError,
  appApiFetch: appApiFetchMock,
}));

const { startTenderAnalysisAction, startDocumentAnalysisAction, retryDocumentAnalysisAction } = await import("./analysis-actions");

/**
 * Mission Sprint 8A.2 (correction bug #10 "erreurs techniques affichées brutes") — avant ce
 * correctif, `analysis-actions.ts` renvoyait `error.message` (texte backend brut) directement au
 * composant, y compris pour le bouton "Analyser" par document (bug #2 élargi). Ces tests prouvent
 * le mapping français désormais en place.
 */
describe("analysis-actions — French error mapping (bug #10)", () => {
  beforeEach(() => {
    appApiFetchMock.mockReset();
    revalidatePathMock.mockReset();
  });

  it("maps a 409 EXTRACTION_NOT_READY_FOR_ANALYSIS to a comprehensible French message, never the raw backend text", async () => {
    appApiFetchMock.mockRejectedValue(new FakeAppApiError(409, "EXTRACTION_NOT_READY_FOR_ANALYSIS", "extraction status is PENDING"));

    const result = await startDocumentAnalysisAction("tender-1", "doc-1");

    expect(result.error).toBe("L'extraction de ce document n'est pas encore prête pour l'analyse.");
    expect(result.error).not.toContain("PENDING");
  });

  it("maps a 409 ANALYSIS_ALREADY_RUNNING to a comprehensible French message", async () => {
    appApiFetchMock.mockRejectedValue(new FakeAppApiError(409, "ANALYSIS_ALREADY_RUNNING", "already running"));

    const result = await startTenderAnalysisAction("tender-1");

    expect(result.error).toBe("Une analyse est déjà en cours.");
  });

  it("maps a 503 AI_PROVIDER_UNAVAILABLE to a comprehensible French message", async () => {
    appApiFetchMock.mockRejectedValue(new FakeAppApiError(503, "AI_PROVIDER_UNAVAILABLE", "provider down"));

    const result = await retryDocumentAnalysisAction("analysis-1");

    expect(result.error).toBe("Le service d'IA est momentanément indisponible. Réessayez dans quelques minutes.");
  });

  it("maps a 404 DOCUMENT_EXTRACTION_NOT_FOUND to a comprehensible French message", async () => {
    appApiFetchMock.mockRejectedValue(new FakeAppApiError(404, "DOCUMENT_EXTRACTION_NOT_FOUND", "not found"));

    const result = await startDocumentAnalysisAction("tender-1", "doc-1");

    expect(result.error).toBe("L'extraction de ce document est introuvable.");
  });

  it("maps an unexpected non-AppApiError to a network error message, never exposing the raw error", async () => {
    appApiFetchMock.mockRejectedValue(new Error("ECONNRESET"));

    const result = await startTenderAnalysisAction("tender-1");

    expect(result.error).toBe("Une erreur réseau est survenue. Vérifiez votre connexion et réessayez.");
    expect(result.error).not.toContain("ECONNRESET");
  });
});
