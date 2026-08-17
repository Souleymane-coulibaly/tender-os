import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatCard } from "./stat-card";

describe("StatCard — Design System Checkpoint C (variation / MetricCard)", () => {
  it("renders without a variation exactly as before (backward compatible)", () => {
    render(<StatCard label="Appels d'offres actifs" value={12} />);
    expect(screen.getByText("Appels d'offres actifs")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("BLOQUANT — an 'up' direction defaults to the success tone, a 'down' direction to danger, without forcing that choice on the caller", () => {
    const { rerender } = render(<StatCard label="Taux de réussite" value="68%" variation={{ label: "+4 pts", direction: "up" }} />);
    expect(screen.getByText("+4 pts").className).toContain("text-success-fg");

    rerender(<StatCard label="Taux de réussite" value="68%" variation={{ label: "-4 pts", direction: "down" }} />);
    expect(screen.getByText("-4 pts").className).toContain("text-danger-fg");
  });

  it("lets the caller override the tone — a rising count is not always good news (e.g. risks detected)", () => {
    render(<StatCard label="Risques détectés" value={9} variation={{ label: "+3 cette semaine", direction: "up", tone: "danger" }} />);
    expect(screen.getByText("+3 cette semaine").className).toContain("text-danger-fg");
  });
});
