import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EstimateHistorySection } from "./estimate-history-section";
import type { PricingEstimateSummary } from "../../../../../../lib/pricing-types";

const getPricingEstimateVersionAction = vi.fn(async (_estimateId: string, _version: number) => ({ estimate: undefined as unknown }));
const getPricingEstimateComparisonAction = vi.fn(async (_estimateId: string) => ({ comparison: undefined as unknown }));

vi.mock("../../../../pricing-actions", () => ({
  getPricingEstimateVersionAction: (estimateId: string, version: number) => getPricingEstimateVersionAction(estimateId, version),
  getPricingEstimateComparisonAction: (estimateId: string) => getPricingEstimateComparisonAction(estimateId),
}));

function estimate(overrides: Partial<PricingEstimateSummary> = {}): PricingEstimateSummary {
  return {
    id: "estimate-1",
    organizationId: "org-1",
    tenderId: "tender-1",
    type: "TENDER_ESTIMATE",
    status: "SUPERSEDED",
    currentVersionNumber: 2,
    createdBy: "user-1",
    createdAt: "2026-08-15T10:00:00.000Z",
    currentVersion: {
      id: "version-2",
      estimateId: "estimate-1",
      version: 2,
      amount: "600.000000",
      currency: "EUR",
      breakdown: [],
      assumptions: {},
      status: "CALCULATED",
      disclaimerVersion: 1,
      disclaimerText: "Estimation indicative et non contractuelle.",
      source: "MANUAL",
      createdBy: "user-1",
      createdAt: "2026-08-15T11:00:00.000Z",
    },
    ...overrides,
  };
}

/**
 * Mission Sprint 7 §"Historique" — vérifie que chaque version d'une estimation est consultable
 * sans jamais être recalculée, et que le disclaimer accompagne systématiquement le montant affiché.
 */
describe("EstimateHistorySection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows a message when the Tender has no estimate yet", () => {
    render(<EstimateHistorySection estimates={[]} />);
    expect(screen.getByText("Aucune estimation pour ce Tender pour l'instant.")).toBeInTheDocument();
  });

  it("lists every version of every estimate, never only the current one", () => {
    render(<EstimateHistorySection estimates={[estimate()]} />);
    expect(screen.getByText("Voir la version 1")).toBeInTheDocument();
    expect(screen.getByText("Voir la version 2")).toBeInTheDocument();
  });

  it("fetches and displays a past version's amount and disclaimer on demand, never recalculating it", async () => {
    getPricingEstimateVersionAction.mockResolvedValueOnce({
      estimate: {
        ...estimate(),
        currentVersion: {
          id: "version-1",
          estimateId: "estimate-1",
          version: 1,
          amount: "500.000000",
          currency: "EUR",
          breakdown: [{ type: "PRODUCTION_TIME", label: "Temps de préparation", amount: "500.000000", currency: "EUR", source: "ESTIMATED", displayOrder: 0 }],
          assumptions: {},
          status: "SUPERSEDED",
          disclaimerVersion: 1,
          disclaimerText: "Estimation indicative et non contractuelle.",
          source: "MANUAL",
          createdBy: "user-1",
          createdAt: "2026-08-15T10:00:00.000Z",
        },
      },
    });
    const user = userEvent.setup();
    render(<EstimateHistorySection estimates={[estimate()]} />);

    await user.click(screen.getByText("Voir la version 1"));

    expect(getPricingEstimateVersionAction).toHaveBeenCalledWith("estimate-1", 1);
    expect((await screen.findAllByText("500.000000 EUR")).length).toBeGreaterThan(0);
    expect(screen.getByText("Estimation indicative et non contractuelle.")).toBeInTheDocument();
  });

  it("offers an estimated/actual comparison for each listed estimate", () => {
    render(<EstimateHistorySection estimates={[estimate()]} />);
    expect(screen.getByRole("button", { name: "Comparer estimé/réel" })).toBeInTheDocument();
  });
});
