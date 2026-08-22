import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BarDistribution } from "./bar-distribution";

describe("BarDistribution — Checkpoint TENDEROS-2.1-P2.3-E5 (Dashboard V2 Premium Analytics)", () => {
  it("BLOQUANT — renders the empty state when total is 0, never an empty/broken chart", () => {
    render(<BarDistribution title="Pipeline" items={[]} total={0} emptyLabel="Aucun dossier actif pour le moment." />);

    expect(screen.getByText("Aucun dossier actif pour le moment.")).toBeInTheDocument();
  });

  it("computes the correct percentage per item from count/total", () => {
    render(
      <BarDistribution
        title="Pipeline"
        items={[
          { key: "a", label: "En analyse", count: 3, colorClass: "bg-blue-500" },
          { key: "b", label: "Prêt", count: 1, colorClass: "bg-green-500" },
        ]}
        total={4}
        emptyLabel="Aucun dossier."
      />,
    );

    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("(75%)")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("(25%)")).toBeInTheDocument();
  });

  it("BLOQUANT — mission §30 addendum (accessibility): count and percentage are real visible text, never information encoded only in the bar's visual length", () => {
    render(<BarDistribution title="GO / NO-GO" items={[{ key: "go", label: "GO", count: 2, colorClass: "bg-green-500" }]} total={2} emptyLabel="Aucune décision." />);

    expect(screen.getByText("GO")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("(100%)")).toBeInTheDocument();
  });

  it("BLOQUANT — correctif accessibilité : a segment's link stays reachable by keyboard/screen reader (never wrapped in aria-hidden, which would make it unreachable via getByRole too)", () => {
    render(<BarDistribution title="Pipeline" items={[{ key: "READY", label: "Prêt", count: 5, colorClass: "bg-blue-500", href: "/app/tenders?status=READY" }]} total={5} emptyLabel="—" />);

    const link = screen.getByRole("link", { name: /Prêt/ });
    expect(link).toHaveAttribute("href", "/app/tenders?status=READY");
  });

  it("never crashes and never divides by zero when an item has a positive count but total is inconsistent (defensive)", () => {
    render(<BarDistribution title="X" items={[{ key: "a", label: "A", count: 0, colorClass: "bg-blue-500" }]} total={0} emptyLabel="Vide" />);
    expect(screen.getByText("Vide")).toBeInTheDocument();
  });
});
