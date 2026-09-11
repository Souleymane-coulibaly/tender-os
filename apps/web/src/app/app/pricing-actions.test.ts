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

const { previewGenerationCostAction, createPricingEstimateAction, recalculatePricingEstimateAction, archivePricingEstimateAction } = await import(
  "./pricing-actions"
);

/**
 * Sprint 7 (AI Pricing & Prévisions) — couvre le contrat réel entre les server actions Pricing et
 * l'API backend : construction du payload (jamais un montant calculé côté frontend), et mapping
 * d'erreur HTTP → message français compréhensible.
 */
describe("pricing-actions", () => {
  beforeEach(() => {
    appApiFetchMock.mockReset();
    revalidatePathMock.mockReset();
  });

  describe("previewGenerationCostAction", () => {
    it("posts the taskType and volume hypotheses, returning the preview result", async () => {
      appApiFetchMock.mockResolvedValue({ status: "CALCULATED", amount: "10.00", disclaimerText: "..." });

      const result = await previewGenerationCostAction("tender-1", { taskType: "EXECUTIVE_SUMMARY", estimatedGenerationsCount: 5 });

      expect(appApiFetchMock).toHaveBeenCalledWith(
        "/api/v1/tenders/tender-1/pricing/preview",
        expect.objectContaining({ method: "POST", body: JSON.stringify({ taskType: "EXECUTIVE_SUMMARY", estimatedGenerationsCount: 5 }) }),
      );
      expect(result.result?.status).toBe("CALCULATED");
    });

    it("maps a network error to a French message, never exposing the raw error", async () => {
      appApiFetchMock.mockRejectedValue(new Error("ECONNRESET"));
      const result = await previewGenerationCostAction("tender-1", { taskType: "EXECUTIVE_SUMMARY" });
      expect(result.error).toBe("Une erreur réseau est survenue. Vérifiez votre connexion et réessayez.");
      expect(result.error).not.toContain("ECONNRESET");
    });
  });

  describe("createPricingEstimateAction", () => {
    it("sends the assumptions and revalidates the tender's pricing page", async () => {
      appApiFetchMock.mockResolvedValue({ id: "estimate-1" });

      const result = await createPricingEstimateAction("tender-1", undefined, { workHours: 10, hourlyRate: "50" });

      expect(appApiFetchMock).toHaveBeenCalledWith(
        "/api/v1/tenders/tender-1/pricing/estimates",
        expect.objectContaining({ method: "POST", body: JSON.stringify({ taskType: undefined, assumptions: { workHours: 10, hourlyRate: "50" } }) }),
      );
      expect(result.estimate?.id).toBe("estimate-1");
      expect(revalidatePathMock).toHaveBeenCalledWith("/app/tenders/tender-1/pricing");
    });

    it("maps a 422 to a French message about invalid assumptions", async () => {
      appApiFetchMock.mockRejectedValue(new FakeAppApiError(422, "INVALID_PRICING_ASSUMPTION", "invalid"));
      const result = await createPricingEstimateAction("tender-1", undefined, {});
      expect(result.error).toBe("Une hypothèse de l'estimation n'est pas valide.");
    });

    it("maps a 404 (cross-tenant/cross-client) to a French message", async () => {
      appApiFetchMock.mockRejectedValue(new FakeAppApiError(404, "TENDER_NOT_FOUND", "not found"));
      const result = await createPricingEstimateAction("tender-1", undefined, {});
      expect(result.error).toBe("Cet appel d'offres est introuvable.");
    });
  });

  describe("recalculatePricingEstimateAction", () => {
    it("sends the reason alongside the new assumptions", async () => {
      appApiFetchMock.mockResolvedValue({ id: "estimate-1", currentVersionNumber: 2 });

      const result = await recalculatePricingEstimateAction("tender-1", "estimate-1", undefined, { workHours: 20, hourlyRate: "50" }, "Périmètre doublé");

      expect(appApiFetchMock).toHaveBeenCalledWith(
        "/api/v1/pricing/estimates/estimate-1/recalculate",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ taskType: undefined, assumptions: { workHours: 20, hourlyRate: "50" }, reason: "Périmètre doublé" }),
        }),
      );
      expect(result.estimate?.currentVersionNumber).toBe(2);
    });

    it("maps a 409 PRICING_ESTIMATE_ARCHIVED to a comprehensible French message", async () => {
      appApiFetchMock.mockRejectedValue(new FakeAppApiError(409, "PRICING_ESTIMATE_ARCHIVED", "archived"));
      const result = await recalculatePricingEstimateAction("tender-1", "estimate-1", undefined, {}, "x");
      expect(result.error).toBe("Cette estimation est archivée : elle ne peut plus être recalculée.");
    });

    it("maps a 409 PRICING_ESTIMATE_CONCURRENT_RECALCULATION to a comprehensible French message", async () => {
      appApiFetchMock.mockRejectedValue(new FakeAppApiError(409, "PRICING_ESTIMATE_CONCURRENT_RECALCULATION", "conflict"));
      const result = await recalculatePricingEstimateAction("tender-1", "estimate-1", undefined, {}, "x");
      expect(result.error).toBe("Un autre recalcul de cette estimation est en cours. Rechargez la page et réessayez.");
    });
  });

  describe("archivePricingEstimateAction", () => {
    it("posts to the archive endpoint and revalidates the pricing page", async () => {
      appApiFetchMock.mockResolvedValue(undefined);
      await archivePricingEstimateAction("tender-1", "estimate-1");
      expect(appApiFetchMock).toHaveBeenCalledWith("/api/v1/pricing/estimates/estimate-1/archive", { method: "POST" });
      expect(revalidatePathMock).toHaveBeenCalledWith("/app/tenders/tender-1/pricing");
    });
  });
});
