import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PeriodSelector } from "./period-selector";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => "/app",
  useSearchParams: () => new URLSearchParams("clientId=client-1"),
}));

describe("PeriodSelector — Checkpoint TENDEROS-2.1-P2.3-E5 (Dashboard V2 Premium Analytics addendum §5)", () => {
  it("BLOQUANT — only exposes 7/30/90, the exact values the backend contract accepts (DashboardQuerySchema)", () => {
    render(<PeriodSelector current={30} />);

    expect(screen.getByRole("button", { name: "7j" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "30j" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "90j" })).toBeInTheDocument();
  });

  it("marks the current period as pressed for assistive technology, never relying on color alone", () => {
    render(<PeriodSelector current={7} />);

    expect(screen.getByRole("button", { name: "7j" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "30j" })).toHaveAttribute("aria-pressed", "false");
  });

  it("navigates preserving other query params (e.g. clientId) when a period is selected", () => {
    render(<PeriodSelector current={30} />);

    fireEvent.click(screen.getByRole("button", { name: "90j" }));

    expect(pushMock).toHaveBeenCalledWith("/app?clientId=client-1&periodDays=90");
  });
});
