import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TenderFilters } from "./tender-filters";

describe("TenderFilters", () => {
  it("renders the minimum filters required by the mission (status, owner, deadline window, overdue, search)", () => {
    render(<TenderFilters basePath="/app/tenders" values={{}} />);

    expect(screen.getByLabelText("Recherche")).toBeInTheDocument();
    expect(screen.getByLabelText("Statut")).toBeInTheDocument();
    expect(screen.getByLabelText("Responsable (ID)")).toBeInTheDocument();
    expect(screen.getByLabelText("Échéance après le")).toBeInTheDocument();
    expect(screen.getByLabelText("Échéance avant le")).toBeInTheDocument();
    expect(screen.getByLabelText(/Echeance depassee uniquement/)).toBeInTheDocument();
  });

  it("pre-fills fields from the current values (URL is the shared source of truth across views)", () => {
    render(
      <TenderFilters
        basePath="/app/tenders"
        values={{ search: "mobilier", status: "IN_ANALYSIS", overdue: true }}
      />,
    );

    expect(screen.getByLabelText("Recherche")).toHaveValue("mobilier");
    expect(screen.getByLabelText("Statut")).toHaveValue("IN_ANALYSIS");
    expect(screen.getByLabelText(/Echeance depassee uniquement/)).toBeChecked();
  });

  it("only shows the sort controls when explicitly used by the List view", () => {
    const { rerender } = render(<TenderFilters basePath="/app/tenders" values={{}} />);
    expect(screen.queryByLabelText("Tri")).not.toBeInTheDocument();

    rerender(
      <TenderFilters basePath="/app/tenders" values={{}} sorting={{ sort: "createdAt", sortDirection: "desc" }} />,
    );
    expect(screen.getByLabelText("Tri")).toBeInTheDocument();
  });
});
