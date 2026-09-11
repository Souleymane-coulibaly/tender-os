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

const { initDceAction, deleteDceDocumentAction, startDceZipImportAction } = await import("./dce-actions");

/**
 * Mission Sprint 8A.2 (correction bug #10 "erreurs techniques affichées brutes") — avant ce
 * correctif, `dce-actions.ts` renvoyait `error.message` (texte backend brut, souvent en anglais)
 * directement au composant. Ces tests prouvent que le mapping français désormais en place ne
 * laisse plus jamais fuiter le message brut, quel que soit le statut HTTP.
 */
describe("dce-actions — French error mapping (bug #10)", () => {
  beforeEach(() => {
    appApiFetchMock.mockReset();
    revalidatePathMock.mockReset();
  });

  it("maps a 409 DCE_ALREADY_EXISTS to a comprehensible French message, never the raw backend text", async () => {
    appApiFetchMock.mockRejectedValue(new FakeAppApiError(409, "DCE_ALREADY_EXISTS", "dce with id x already exists"));

    const result = await initDceAction("tender-1");

    expect(result.error).toBe("Cet appel d'offres a déjà un DCE.");
    expect(result.error).not.toContain("already exists");
  });

  it("maps a 409 TENDER_ARCHIVED_FOR_DCE_MUTATION to a comprehensible French message", async () => {
    appApiFetchMock.mockRejectedValue(new FakeAppApiError(409, "TENDER_ARCHIVED_FOR_DCE_MUTATION", "tender is archived"));

    const result = await deleteDceDocumentAction("tender-1", "doc-1");

    expect(result.error).toBe("Cet appel d'offres est archivé : son DCE ne peut plus être modifié.");
  });

  it("maps a 422 ZIP_SECURITY_VIOLATION to a comprehensible French message", async () => {
    appApiFetchMock.mockRejectedValue(new FakeAppApiError(422, "ZIP_SECURITY_VIOLATION", "zip slip detected"));
    const formData = new FormData();
    formData.set("archive", new File(["x"], "archive.zip"));

    const result = await startDceZipImportAction("tender-1", formData);

    expect(result.error).toBe("L'archive ZIP a été refusée pour des raisons de sécurité.");
    expect(result.error).not.toContain("zip slip");
  });

  it("maps a 404 to a generic French message (never leaking which resource was checked)", async () => {
    appApiFetchMock.mockRejectedValue(new FakeAppApiError(404, "CLIENT_ACCOUNT_NOT_FOUND", "client account not found"));

    const result = await initDceAction("tender-1");

    expect(result.error).toBe("Cet élément est introuvable, ou vous n'y avez pas accès.");
    expect(result.error).not.toMatch(/client/i);
  });

  it("maps an unexpected non-AppApiError to a network error message, never exposing the raw error", async () => {
    appApiFetchMock.mockRejectedValue(new Error("ECONNRESET"));

    const result = await initDceAction("tender-1");

    expect(result.error).toBe("Une erreur réseau est survenue. Vérifiez votre connexion et réessayez.");
    expect(result.error).not.toContain("ECONNRESET");
  });

  it("still revalidates the Tender page on success (no regression on the existing behavior)", async () => {
    appApiFetchMock.mockResolvedValue(undefined);

    await initDceAction("tender-1");

    expect(revalidatePathMock).toHaveBeenCalledWith("/app/tenders/tender-1");
  });
});
