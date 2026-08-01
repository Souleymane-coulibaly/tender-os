import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ClientPricingSection } from "./client-pricing-section";
import type { ClientCostSummary } from "../../../../../lib/pricing-types";

function summary(overrides: Partial<ClientCostSummary> = {}): ClientCostSummary {
  return {
    clientAccountId: "client-1",
    technicalCost: { generationCount: 0, calculatedCount: 0, partialCount: 0, unknownCount: 0, totalsByCurrency: {}, mixedCurrencies: false },
    byTender: {},
    disclaimerText: "Estimation indicative et non contractuelle.",
    calculatedAt: "2026-08-15T10:00:00.000Z",
    ...overrides,
  };
}

/**
 * Mission Sprint 7 §"Pricing par client" — vue en lecture seule, jamais un montant fusionné entre
 * Tenders, jamais un 0€ fabriqué quand le coût est inconnu, disclaimer systématique.
 */
describe("ClientPricingSection", () => {
  it("shows 'Coût non disponible' rather than 0€ when there is no cost data yet", () => {
    render(<ClientPricingSection summary={summary()} />);
    expect(screen.getByText("Coût non disponible")).toBeInTheDocument();
    expect(screen.queryByText(/0 €/)).not.toBeInTheDocument();
  });

  it("shows the disclaimer unconditionally", () => {
    render(<ClientPricingSection summary={summary()} />);
    expect(screen.getByRole("note")).toHaveTextContent("indicative et non contractuelle");
  });

  it("shows the technical cost broken down per Tender, never merged across Tenders", () => {
    render(
      <ClientPricingSection
        summary={summary({
          technicalCost: { generationCount: 2, calculatedCount: 2, partialCount: 0, unknownCount: 0, totalsByCurrency: { EUR: "15.000000" }, mixedCurrencies: false },
          byTender: {
            "tender-1": { generationCount: 1, calculatedCount: 1, partialCount: 0, unknownCount: 0, totalsByCurrency: { EUR: "10.000000" }, mixedCurrencies: false },
            "tender-2": { generationCount: 1, calculatedCount: 1, partialCount: 0, unknownCount: 0, totalsByCurrency: { EUR: "5.000000" }, mixedCurrencies: false },
          },
        })}
      />,
    );
    expect(screen.getByText("15.000000 EUR")).toBeInTheDocument();
    expect(screen.getByText("10.000000 EUR")).toBeInTheDocument();
    expect(screen.getByText("5.000000 EUR")).toBeInTheDocument();
  });
});
