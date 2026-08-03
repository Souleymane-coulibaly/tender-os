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

const { confirmSignatureRequirementAction, syncSignatureTransactionAction, verifySignedDocumentIntegrityAction } = await import("./signature-actions");

/**
 * Mission Sprint 8A.2 (correction bug #9 "états frontend obsolètes après opération backend") —
 * avant ce correctif, chaque mutation de signature ne revalidait que l'onglet Signature
 * (`/app/tenders/:id/signature`), jamais la fiche Tender elle-même (`/app/tenders/:id`), qui
 * affiche pourtant le même "score de préparation" calculé par `GetReadinessStatusUseCase` (bug
 * #5) — un utilisateur signant un document puis revenant sur la fiche Tender via la navigation
 * cliente voyait un score de préparation obsolète. Ces tests prouvent que les deux routes sont
 * désormais invalidées ensemble.
 */
describe("signature-actions — revalidates both the signature tab AND the Tender overview (bug #9)", () => {
  beforeEach(() => {
    appApiFetchMock.mockReset();
    revalidatePathMock.mockReset();
  });

  it("confirmSignatureRequirementAction revalidates /app/tenders/:id/signature and /app/tenders/:id", async () => {
    appApiFetchMock.mockResolvedValue(undefined);

    await confirmSignatureRequirementAction("tender-1", "req-1");

    expect(revalidatePathMock).toHaveBeenCalledWith("/app/tenders/tender-1/signature");
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/tenders/tender-1");
  });

  it("syncSignatureTransactionAction revalidates /app/tenders/:id/signature and /app/tenders/:id", async () => {
    appApiFetchMock.mockResolvedValue(undefined);

    await syncSignatureTransactionAction("tender-1", "transaction-1");

    expect(revalidatePathMock).toHaveBeenCalledWith("/app/tenders/tender-1/signature");
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/tenders/tender-1");
  });

  it("verifySignedDocumentIntegrityAction revalidates /app/tenders/:id/signature and /app/tenders/:id", async () => {
    appApiFetchMock.mockResolvedValue(undefined);

    await verifySignedDocumentIntegrityAction("tender-1", "transaction-1");

    expect(revalidatePathMock).toHaveBeenCalledWith("/app/tenders/tender-1/signature");
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/tenders/tender-1");
  });

  it("never revalidates on failure", async () => {
    appApiFetchMock.mockRejectedValue(new FakeAppApiError(409, "SOME_CONFLICT", "conflict"));

    await syncSignatureTransactionAction("tender-1", "transaction-1");

    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
