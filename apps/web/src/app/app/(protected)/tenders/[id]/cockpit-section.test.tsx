import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CockpitSection } from "./cockpit-section";
import type { TenderCockpit } from "../../../../../lib/cockpit-types";

function cockpit(overrides: Partial<TenderCockpit> = {}): TenderCockpit {
  return {
    tenderId: "tender-1",
    currentStep: "DISCOVERY",
    nextAction: "INITIALIZE_DCE",
    modules: [
      { key: "DCE", status: "NOT_STARTED" },
      { key: "ANALYSIS", status: "NOT_STARTED" },
      { key: "PRICING", status: "NOT_STARTED" },
      { key: "DELIVERABLES", status: "NOT_STARTED", count: 0, total: 9 },
      { key: "EXPORT", status: "NOT_STARTED" },
      { key: "VALIDATION", status: "NOT_STARTED" },
      { key: "SIGNATURE", status: "NOT_APPLICABLE" },
      { key: "PACKAGE", status: "NOT_STARTED" },
    ],
    alerts: [],
    ...overrides,
  };
}

describe("CockpitSection", () => {
  it("renders the current step in French and the next action, never the raw backend code", () => {
    render(<CockpitSection tenderId="tender-1" cockpit={cockpit()} />);
    expect(screen.getByText("Découverte du dossier")).toBeInTheDocument();
    expect(screen.getByText(/Initialiser le DCE/)).toBeInTheDocument();
    expect(screen.queryByText("DISCOVERY")).not.toBeInTheDocument();
    expect(screen.queryByText("INITIALIZE_DCE")).not.toBeInTheDocument();
  });

  it("renders the deliverables count as x/9, never just a bare status", () => {
    render(<CockpitSection tenderId="tender-1" cockpit={cockpit()} />);
    expect(screen.getByText(/\(0\/9\)/)).toBeInTheDocument();
  });

  it("links each module to its own screen — DCE included, since it has had a dedicated tab since 2.1-A5", () => {
    render(<CockpitSection tenderId="tender-1" cockpit={cockpit()} />);
    expect(screen.getByRole("link", { name: /Livrables/ })).toHaveAttribute("href", "/app/tenders/tender-1/deliverables");
    expect(screen.getByRole("link", { name: /Signature/ })).toHaveAttribute("href", "/app/tenders/tender-1/signature");
    expect(screen.getByRole("link", { name: /Dossier de soumission/ })).toHaveAttribute("href", "/app/tenders/tender-1/submission-package");
    expect(screen.getByRole("link", { name: /Documents & DCE/ })).toHaveAttribute("href", "/app/tenders/tender-1/dce");
  });

  it("surfaces a BLOCKER alert with role=alert and its French label, never a raw code", () => {
    render(<CockpitSection tenderId="tender-1" cockpit={cockpit({ alerts: [{ level: "BLOCKER", code: "DELIVERABLE_BLOCKED" }] })} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Au moins un livrable est bloqué et doit être débloqué.");
  });

  it("renders no alert list when there are no alerts", () => {
    render(<CockpitSection tenderId="tender-1" cockpit={cockpit({ alerts: [] })} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("marks the Signature module as not applicable when no mandatory signature requirement was detected", () => {
    render(<CockpitSection tenderId="tender-1" cockpit={cockpit()} />);
    expect(screen.getByText("Non concerné")).toBeInTheDocument();
  });
});
