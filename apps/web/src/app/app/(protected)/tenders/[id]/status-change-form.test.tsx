import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StatusChangeForm } from "./status-change-form";

vi.mock("../../../actions", () => ({
  changeTenderStatusAction: {
    bind: () => vi.fn(async (_prevState: unknown, _formData: FormData) => ({})),
  },
}));

describe("StatusChangeForm", () => {
  it("only offers the statuses reachable from DRAFT (excluding ARCHIVED, handled separately)", () => {
    render(<StatusChangeForm tenderId="tender-1" status="DRAFT" />);

    const select = screen.getByLabelText("Changer le statut");
    const options = Array.from(select.querySelectorAll("option")).map((option) => option.getAttribute("value"));

    expect(options).toEqual(["IN_ANALYSIS"]);
  });

  it("offers every non-terminal transition from IN_ANALYSIS", () => {
    render(<StatusChangeForm tenderId="tender-1" status="IN_ANALYSIS" />);

    const select = screen.getByLabelText("Changer le statut");
    const options = Array.from(select.querySelectorAll("option")).map((option) => option.getAttribute("value"));

    expect(options).toEqual(["READY", "DRAFT"]);
  });

  it("renders nothing once the tender is ARCHIVED (terminal status)", () => {
    const { container } = render(<StatusChangeForm tenderId="tender-1" status="ARCHIVED" />);

    expect(container).toBeEmptyDOMElement();
  });
});
