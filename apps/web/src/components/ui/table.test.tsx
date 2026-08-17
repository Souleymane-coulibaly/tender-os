import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TablePagination } from "./table";

describe("TablePagination", () => {
  it("renders nothing when there is only one page — never an empty/disabled pagination bar for a trivial list", () => {
    const { container } = render(<TablePagination page={1} pageCount={1} getHref={(page) => `/app/tenders?page=${page}`} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("BLOQUANT — computes hrefs via the caller's getHref, never a hardcoded query param shape, and disables Précédent on page 1", () => {
    render(<TablePagination page={1} pageCount={5} getHref={(page) => `/app/tenders?page=${page}`} />);

    const previous = screen.getByRole("link", { name: "Précédent" });
    const next = screen.getByRole("link", { name: "Suivant" });

    expect(previous).toHaveAttribute("href", "/app/tenders?page=1");
    expect(previous).toHaveAttribute("aria-disabled", "true");
    expect(next).toHaveAttribute("href", "/app/tenders?page=2");
    expect(next).toHaveAttribute("aria-disabled", "false");
  });

  it("disables Suivant on the last page", () => {
    render(<TablePagination page={5} pageCount={5} getHref={(page) => `/app/tenders?page=${page}`} />);
    expect(screen.getByRole("link", { name: "Suivant" })).toHaveAttribute("aria-disabled", "true");
  });

  it("shows the current page and total page count", () => {
    render(<TablePagination page={3} pageCount={7} getHref={(page) => `/app/tenders?page=${page}`} />);
    expect(screen.getByText("Page 3 sur 7")).toBeInTheDocument();
  });
});
