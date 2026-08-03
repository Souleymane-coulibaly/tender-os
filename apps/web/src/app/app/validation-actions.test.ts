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

const { approveFinalVersionAction, reopenFinalVersionAction, resolveValidationIssueAction } = await import("./validation-actions");

/**
 * Mission Sprint 8A.2 (correction bug #9 "états frontend obsolètes après opération backend") —
 * avant ce correctif, chaque mutation de validation ne revalidait que l'onglet Validation
 * (`/app/tenders/:id/validation`), jamais la fiche Tender elle-même (`/app/tenders/:id`), qui
 * affiche pourtant le même "score de préparation" calculé par `GetReadinessStatusUseCase` (bug
 * #5) — approuver la version finale change ce statut (APPROVED) mais la fiche Tender restait
 * obsolète après une navigation cliente. Ces tests prouvent que les deux routes sont désormais
 * invalidées ensemble.
 */
describe("validation-actions — revalidates both the validation tab AND the Tender overview (bug #9)", () => {
  beforeEach(() => {
    appApiFetchMock.mockReset();
    revalidatePathMock.mockReset();
  });

  it("approveFinalVersionAction revalidates /app/tenders/:id/validation and /app/tenders/:id", async () => {
    appApiFetchMock.mockResolvedValue({ id: "approval-1" });

    await approveFinalVersionAction("tender-1", "run-1", undefined);

    expect(revalidatePathMock).toHaveBeenCalledWith("/app/tenders/tender-1/validation");
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/tenders/tender-1");
  });

  it("reopenFinalVersionAction revalidates /app/tenders/:id/validation and /app/tenders/:id", async () => {
    appApiFetchMock.mockResolvedValue(undefined);

    await reopenFinalVersionAction("tender-1", "raison");

    expect(revalidatePathMock).toHaveBeenCalledWith("/app/tenders/tender-1/validation");
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/tenders/tender-1");
  });

  it("resolveValidationIssueAction revalidates /app/tenders/:id/validation and /app/tenders/:id", async () => {
    appApiFetchMock.mockResolvedValue(undefined);

    await resolveValidationIssueAction("tender-1", "issue-1", "corrigé");

    expect(revalidatePathMock).toHaveBeenCalledWith("/app/tenders/tender-1/validation");
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/tenders/tender-1");
  });

  it("never revalidates on failure", async () => {
    appApiFetchMock.mockRejectedValue(new FakeAppApiError(422, "BLOCKING_ISSUES_OPEN", "issues open"));

    await approveFinalVersionAction("tender-1", "run-1", undefined);

    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
