import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FilterBar } from "./filter-bar";

describe("FilterBar", () => {
  it("renders the search/filters/actions slots together, without imposing their internal shape", () => {
    render(
      <FilterBar
        search={<input aria-label="Rechercher" />}
        filters={<select aria-label="Statut" />}
        actions={<button type="button">Réinitialiser</button>}
      />,
    );

    expect(screen.getByLabelText("Rechercher")).toBeInTheDocument();
    expect(screen.getByLabelText("Statut")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réinitialiser" })).toBeInTheDocument();
  });

  it("renders cleanly with only a subset of slots provided", () => {
    render(<FilterBar search={<input aria-label="Rechercher" />} />);
    expect(screen.getByLabelText("Rechercher")).toBeInTheDocument();
  });
});
