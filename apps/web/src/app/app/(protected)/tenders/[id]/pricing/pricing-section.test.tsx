import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PricingSection } from "./pricing-section";
import type { PricingEstimateSummary, TenderCostSummary } from "../../../../../../lib/pricing-types";

const createPricingEstimateAction = vi.fn(async (_tenderId: string, _taskType: string | undefined, _assumptions: unknown) => ({ estimate: {} }));
const recalculatePricingEstimateAction = vi.fn(
  async (_tenderId: string, _estimateId: string, _taskType: string | undefined, _assumptions: unknown, _reason: string) => ({ estimate: {} }),
);
const archivePricingEstimateAction = vi.fn(async (_tenderId: string, _estimateId: string) => ({}));
const previewGenerationCostAction = vi.fn(async (_tenderId: string, _input: unknown) => ({ result: undefined as unknown }));
const getPricingEstimateComparisonAction = vi.fn(async (_estimateId: string) => ({ comparison: undefined as unknown }));

vi.mock("../../../../pricing-actions", () => ({
  createPricingEstimateAction: (tenderId: string, taskType: string | undefined, assumptions: unknown) =>
    createPricingEstimateAction(tenderId, taskType, assumptions),
  recalculatePricingEstimateAction: (tenderId: string, estimateId: string, taskType: string | undefined, assumptions: unknown, reason: string) =>
    recalculatePricingEstimateAction(tenderId, estimateId, taskType, assumptions, reason),
  archivePricingEstimateAction: (tenderId: string, estimateId: string) => archivePricingEstimateAction(tenderId, estimateId),
  previewGenerationCostAction: (tenderId: string, input: unknown) => previewGenerationCostAction(tenderId, input),
  getPricingEstimateComparisonAction: (estimateId: string) => getPricingEstimateComparisonAction(estimateId),
}));

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

function estimate(overrides: Partial<PricingEstimateSummary> = {}): PricingEstimateSummary {
  return {
    id: "estimate-1",
    organizationId: "org-1",
    tenderId: "tender-1",
    type: "TENDER_ESTIMATE",
    status: "CALCULATED",
    currentVersionNumber: 1,
    createdBy: "user-1",
    createdAt: "2026-08-15T10:00:00.000Z",
    currentVersion: {
      id: "version-1",
      estimateId: "estimate-1",
      version: 1,
      amount: "500.000000",
      currency: "EUR",
      breakdown: [{ type: "PRODUCTION_TIME", label: "Temps de préparation", amount: "500.000000", currency: "EUR", source: "ESTIMATED", displayOrder: 0 }],
      assumptions: {},
      status: "CALCULATED",
      disclaimerVersion: 1,
      disclaimerText: "Estimation indicative et non contractuelle.",
      source: "MANUAL",
      createdBy: "user-1",
      createdAt: "2026-08-15T10:00:00.000Z",
    },
    ...overrides,
  };
}

function summary(overrides: Partial<TenderCostSummary> = {}): TenderCostSummary {
  return {
    tenderId: "tender-1",
    technicalCost: { generationCount: 0, calculatedCount: 0, partialCount: 0, unknownCount: 0, totalsByCurrency: {}, mixedCurrencies: false },
    byTaskType: {},
    disclaimerText: "Estimation indicative et non contractuelle.",
    calculatedAt: "2026-08-15T10:00:00.000Z",
    ...overrides,
  };
}

describe("PricingSection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows 'Coût non disponible' rather than 0€ when there is no technical cost data yet", () => {
    render(<PricingSection tenderId="tender-1" initialSummary={summary()} actorRole="OWNER" />);
    expect(screen.getByText("Coût non disponible")).toBeInTheDocument();
    expect(screen.queryByText(/0 €/)).not.toBeInTheDocument();
  });

  it("shows the disclaimer text unconditionally", () => {
    render(<PricingSection tenderId="tender-1" initialSummary={summary()} actorRole="OWNER" />);
    expect(screen.getByRole("note")).toHaveTextContent("indicative et non contractuelle");
  });

  it("a role allowed to manage pricing can create an estimate, sending the entered assumptions", async () => {
    const user = userEvent.setup();
    render(<PricingSection tenderId="tender-1" initialSummary={summary()} actorRole="OWNER" />);

    await user.click(screen.getByRole("button", { name: "Nouvelle estimation" }));
    await user.type(screen.getByLabelText("Temps de préparation (heures)"), "10");
    await user.type(screen.getByLabelText("Taux horaire (€)"), "50");
    await user.click(screen.getByRole("button", { name: "Calculer et enregistrer" }));

    expect(createPricingEstimateAction).toHaveBeenCalledWith(
      "tender-1",
      undefined,
      expect.objectContaining({ workHours: 10, hourlyRate: "50" }),
    );
    expect(refreshMock).toHaveBeenCalled();
  });

  it("a READ_ONLY actor never sees the create-estimate button", () => {
    render(<PricingSection tenderId="tender-1" initialSummary={summary()} actorRole="READ_ONLY" />);
    expect(screen.queryByRole("button", { name: "Nouvelle estimation" })).not.toBeInTheDocument();
    expect(screen.getByText("Aucune estimation active pour ce Tender.")).toBeInTheDocument();
  });

  it("shows the active estimate's amount, status, and breakdown, with Recalculer/Archiver available", () => {
    render(<PricingSection tenderId="tender-1" initialSummary={summary({ activeEstimate: estimate() })} actorRole="OWNER" />);
    expect(screen.getAllByText(/500\.000000 EUR/).length).toBeGreaterThan(0);
    expect(screen.getByText("Calculée")).toBeInTheDocument();
    expect(screen.getByText("Temps de préparation")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recalculer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archiver" })).toBeInTheDocument();
  });

  it("an ARCHIVED estimate hides Recalculer/Archiver", () => {
    render(<PricingSection tenderId="tender-1" initialSummary={summary({ activeEstimate: estimate({ status: "ARCHIVED" }) })} actorRole="OWNER" />);
    expect(screen.queryByRole("button", { name: "Recalculer" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archiver" })).not.toBeInTheDocument();
  });

  it("recalculate requires a reason before it can be confirmed, then calls the action", async () => {
    const user = userEvent.setup();
    render(<PricingSection tenderId="tender-1" initialSummary={summary({ activeEstimate: estimate() })} actorRole="OWNER" />);

    await user.click(screen.getByRole("button", { name: "Recalculer" }));
    await user.type(screen.getByLabelText("Raison du recalcul *"), "Le périmètre a changé");
    await user.click(screen.getByRole("button", { name: "Confirmer le recalcul" }));

    expect(recalculatePricingEstimateAction).toHaveBeenCalledWith("tender-1", "estimate-1", undefined, expect.anything(), "Le périmètre a changé");
    expect(refreshMock).toHaveBeenCalled();
  });

  it("clicking Archiver calls archivePricingEstimateAction and refreshes", async () => {
    const user = userEvent.setup();
    render(<PricingSection tenderId="tender-1" initialSummary={summary({ activeEstimate: estimate() })} actorRole="OWNER" />);

    await user.click(screen.getByRole("button", { name: "Archiver" }));

    expect(archivePricingEstimateAction).toHaveBeenCalledWith("tender-1", "estimate-1");
    expect(refreshMock).toHaveBeenCalled();
  });

  it("réaudit Sprint 7 — requires a taskType before previewing (never previews with an empty one)", async () => {
    const user = userEvent.setup();
    render(<PricingSection tenderId="tender-1" initialSummary={summary()} actorRole="OWNER" />);

    await user.click(screen.getByRole("button", { name: "Nouvelle estimation" }));
    await user.click(screen.getByRole("button", { name: "Prévisualiser" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Le type de tâche IA est requis");
    expect(previewGenerationCostAction).not.toHaveBeenCalled();
  });

  it("réaudit Sprint 7 — previews the AI cost before creation, without ever computing an amount client-side", async () => {
    previewGenerationCostAction.mockResolvedValueOnce({
      result: {
        amount: "12.500000",
        currency: "EUR",
        breakdown: [],
        status: "CALCULATED",
        usedHistoricalAverage: false,
        disclaimerVersion: 1,
        disclaimerText: "Estimation indicative et non contractuelle.",
        calculatedAt: "2026-08-15T10:00:00.000Z",
      },
    });
    const user = userEvent.setup();
    render(<PricingSection tenderId="tender-1" initialSummary={summary()} actorRole="OWNER" />);

    await user.click(screen.getByRole("button", { name: "Nouvelle estimation" }));
    await user.type(screen.getByLabelText("Type de tâche IA (pour le coût IA prévisionnel)"), "EXECUTIVE_SUMMARY");
    await user.click(screen.getByRole("button", { name: "Prévisualiser" }));

    expect(previewGenerationCostAction).toHaveBeenCalledWith("tender-1", { taskType: "EXECUTIVE_SUMMARY" });
    expect(await screen.findByText("12.500000 EUR")).toBeInTheDocument();
    expect(screen.getByText("Aperçu (non enregistré)")).toBeInTheDocument();
  });

  it("réaudit Sprint 7 — shows 'Coût non disponible' in the preview rather than a fabricated 0€ when the amount is unknown", async () => {
    previewGenerationCostAction.mockResolvedValueOnce({
      result: {
        breakdown: [],
        status: "UNKNOWN",
        usedHistoricalAverage: false,
        disclaimerVersion: 1,
        disclaimerText: "Estimation indicative et non contractuelle.",
        calculatedAt: "2026-08-15T10:00:00.000Z",
      },
    });
    const user = userEvent.setup();
    render(<PricingSection tenderId="tender-1" initialSummary={summary()} actorRole="OWNER" />);

    await user.click(screen.getByRole("button", { name: "Nouvelle estimation" }));
    await user.type(screen.getByLabelText("Type de tâche IA (pour le coût IA prévisionnel)"), "EXECUTIVE_SUMMARY");
    await user.click(screen.getByRole("button", { name: "Prévisualiser" }));

    const unavailable = await screen.findAllByText("Coût non disponible");
    expect(unavailable.length).toBeGreaterThan(0);
  });

  it("réaudit Sprint 7 — can compare the active estimate's estimated vs actual AI cost on demand", async () => {
    getPricingEstimateComparisonAction.mockResolvedValueOnce({
      comparison: {
        estimate: {},
        estimatedAiCostAmount: "10.000000",
        actualAiCostAmount: "12.500000",
        currency: "EUR",
        absoluteDifference: "2.500000",
        percentageDifference: "25.00",
        actualStatus: "AVAILABLE",
        disclaimerText: "Estimation indicative et non contractuelle.",
        comparedAt: "2026-08-15T10:00:00.000Z",
      },
    });
    const user = userEvent.setup();
    render(<PricingSection tenderId="tender-1" initialSummary={summary({ activeEstimate: estimate() })} actorRole="OWNER" />);

    await user.click(screen.getByRole("button", { name: "Comparer estimé/réel" }));

    expect(getPricingEstimateComparisonAction).toHaveBeenCalledWith("estimate-1");
    expect(await screen.findByText("2.500000 EUR (25.00 %)")).toBeInTheDocument();
  });

  it("réaudit Sprint 7 — shows 'Coût non disponible' for the actual cost rather than 0€ when it is unknown", async () => {
    getPricingEstimateComparisonAction.mockResolvedValueOnce({
      comparison: {
        estimate: {},
        estimatedAiCostAmount: "10.000000",
        currency: "EUR",
        actualStatus: "UNKNOWN",
        disclaimerText: "Estimation indicative et non contractuelle.",
        comparedAt: "2026-08-15T10:00:00.000Z",
      },
    });
    const user = userEvent.setup();
    render(<PricingSection tenderId="tender-1" initialSummary={summary({ activeEstimate: estimate() })} actorRole="OWNER" />);

    await user.click(screen.getByRole("button", { name: "Comparer estimé/réel" }));

    const unavailable = await screen.findAllByText("Coût non disponible");
    expect(unavailable.length).toBeGreaterThan(0);
  });

  it("réaudit Sprint 7 — shows the backend's French error message when an action fails, never a raw code", async () => {
    archivePricingEstimateAction.mockResolvedValue({ error: "Cette estimation est archivée et ne peut plus être recalculée." });
    const user = userEvent.setup();
    render(<PricingSection tenderId="tender-1" initialSummary={summary({ activeEstimate: estimate() })} actorRole="OWNER" />);

    await user.click(screen.getByRole("button", { name: "Archiver" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Cette estimation est archivée et ne peut plus être recalculée.");
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
