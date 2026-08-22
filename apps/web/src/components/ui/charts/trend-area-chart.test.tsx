import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TrendAreaChart } from "./trend-area-chart";

describe("TrendAreaChart — Checkpoint TENDEROS-2.1-P2.3-E5 (Dashboard V2 Premium Analytics)", () => {
  it("BLOQUANT — mission §25 addendum (Real Data Only): renders an elegant empty state when every point is 0, never a misleading flat line presented as real data", () => {
    const points = Array.from({ length: 7 }, (_, i) => ({ date: `2026-06-0${i + 1}`, count: 0 }));
    render(<TrendAreaChart points={points} seriesLabel="Appels d'offres créés" />);

    expect(screen.getByText("Aucune activité sur cette période")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("BLOQUANT — mission §30 addendum (accessibility): the chart has an accessible name summarizing the real total, and a full sr-only data table alternative", () => {
    const points = [
      { date: "2026-06-13", count: 1 },
      { date: "2026-06-14", count: 0 },
      { date: "2026-06-15", count: 2 },
    ];
    render(<TrendAreaChart points={points} seriesLabel="Appels d'offres créés" />);

    const chart = screen.getByRole("img");
    expect(chart.getAttribute("aria-labelledby")).toBeTruthy();
    expect(screen.getByText(/Appels d'offres créés : 3 sur la période/)).toBeInTheDocument();

    const table = screen.getByRole("table", { name: "Appels d'offres créés, par jour" });
    expect(table).toHaveTextContent("2026-06-13");
    expect(table).toHaveTextContent("2026-06-15");
  });

  it("never omits a day — renders exactly as many accessible table rows as points supplied", () => {
    const points = Array.from({ length: 30 }, (_, i) => ({ date: `day-${i}`, count: i % 3 }));
    render(<TrendAreaChart points={points} seriesLabel="Série" />);

    const table = screen.getByRole("table");
    // 30 lignes de données + 1 ligne d'en-tête.
    expect(table.querySelectorAll("tbody tr")).toHaveLength(30);
  });
});
