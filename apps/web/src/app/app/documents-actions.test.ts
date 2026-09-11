import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePathMock = vi.fn();
const redirectMock = vi.fn();
const appApiFetchMock = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

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

const { attachExistingDocumentToTenderAction, detachDocumentFromTenderAction } = await import("./documents-actions");

/**
 * Mission Sprint 8A.2 (correction bug #10 "erreurs techniques affichées brutes") — avant ce
 * correctif, `documents-actions.ts` renvoyait `error.message` (texte backend brut) directement au
 * composant, y compris pour attacher/détacher un document depuis la fiche Tender. Ces tests
 * prouvent le mapping français désormais en place.
 */
describe("documents-actions — French error mapping (bug #10)", () => {
  beforeEach(() => {
    appApiFetchMock.mockReset();
    revalidatePathMock.mockReset();
    redirectMock.mockReset();
  });

  it("maps a 409 DUPLICATE_DOCUMENT_TENDER_ASSOCIATION to a comprehensible French message, never the raw backend text", async () => {
    appApiFetchMock.mockRejectedValue(new FakeAppApiError(409, "DUPLICATE_DOCUMENT_TENDER_ASSOCIATION", "association already exists"));
    const formData = new FormData();
    formData.set("documentId", "doc-1");

    const result = await attachExistingDocumentToTenderAction("tender-1", {}, formData);

    expect(result.error).toBe("Ce document est déjà rattaché à cet appel d'offres.");
    expect(result.error).not.toContain("already exists");
  });

  it("maps a 409 DOCUMENT_ARCHIVED to a comprehensible French message", async () => {
    appApiFetchMock.mockRejectedValue(new FakeAppApiError(409, "DOCUMENT_ARCHIVED", "document is archived"));

    const result = await detachDocumentFromTenderAction("tender-1", "doc-1");

    expect(result.error).toBe("Ce document est archivé : il ne peut plus être modifié ni recevoir de nouvelle version.");
  });

  it("maps a 404 to a generic French message", async () => {
    appApiFetchMock.mockRejectedValue(new FakeAppApiError(404, "DOCUMENT_NOT_FOUND", "not found"));

    const result = await detachDocumentFromTenderAction("tender-1", "doc-1");

    expect(result.error).toBe("Ce document est introuvable.");
  });

  it("maps an unexpected non-AppApiError to a network error message, never exposing the raw error", async () => {
    appApiFetchMock.mockRejectedValue(new Error("ECONNRESET"));
    const formData = new FormData();
    formData.set("documentId", "doc-1");

    const result = await attachExistingDocumentToTenderAction("tender-1", {}, formData);

    expect(result.error).toBe("Une erreur réseau est survenue. Vérifiez votre connexion et réessayez.");
    expect(result.error).not.toContain("ECONNRESET");
  });

  it("still revalidates the Tender page on success (no regression on the existing behavior)", async () => {
    appApiFetchMock.mockResolvedValue(undefined);

    await detachDocumentFromTenderAction("tender-1", "doc-1");

    expect(revalidatePathMock).toHaveBeenCalledWith("/app/tenders/tender-1");
  });
});
