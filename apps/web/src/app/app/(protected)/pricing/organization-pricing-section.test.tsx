import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OrganizationPricingSection } from "./organization-pricing-section";
import type { OrganizationCostSummary } from "../../../../lib/pricing-types";

function summary(overrides: Partial<OrganizationCostSummary> = {}): OrganizationCostSummary {
  return {
    technicalCost: { generationCount: 0, calculatedCount: 0, partialCount: 0, unknownCount: 0, totalsByCurrency: {}, mixedCurrencies: false },
    byClient: {},
    byTaskType: {},
    disclaimerText: "Estimation indicative et non contractuelle.",
    calculatedAt: "2026-08-15T10:00:00.000Z",
    ...overrides,
  };
}

/**
 * Mission Sprint 7 §"Pricing par organisation" — jamais un 0€ fabriqué, disclaimer systématique,
 * jamais un montant fusionné entre clients.
 */
describe("OrganizationPricingSection", () => {
  it("shows 'Coût non disponible' rather than 0€ when there is no cost data yet", () => {
    render(<OrganizationPricingSection summary={summary()} />);
    expect(screen.getByText("Coût non disponible")).toBeInTheDocument();
    expect(screen.queryByText(/0 €/)).not.toBeInTheDocument();
  });

  it("shows the disclaimer unconditionally", () => {
    render(<OrganizationPricingSection summary={summary()} />);
    expect(screen.getByRole("note")).toHaveTextContent("indicative et non contractuelle");
  });

  it("breaks the cost down per client and per task type, never merged", () => {
    render(
      <OrganizationPricingSection
        summary={summary({
          byClient: { "client-1": { generationCount: 1, calculatedCount: 1, partialCount: 0, unknownCount: 0, totalsByCurrency: { EUR: "10.000000" }, mixedCurrencies: false } },
          byTaskType: { EXECUTIVE_SUMMARY: { generationCount: 1, calculatedCount: 1, partialCount: 0, unknownCount: 0, totalsByCurrency: { EUR: "10.000000" }, mixedCurrencies: false } },
        })}
      />,
    );
    expect(screen.getByText(`Client ${"client-1".slice(0, 8)}`)).toBeInTheDocument();
    expect(screen.getByText("EXECUTIVE_SUMMARY")).toBeInTheDocument();
  });

  it("flags mixed currencies rather than silently summing them", () => {
    render(
      <OrganizationPricingSection
        summary={summary({
          technicalCost: { generationCount: 2, calculatedCount: 2, partialCount: 0, unknownCount: 0, totalsByCurrency: { EUR: "10.000000", USD: "5.000000" }, mixedCurrencies: true },
        })}
      />,
    );
    expect(screen.getByText(/Plusieurs devises détectées/)).toBeInTheDocument();
  });
});
