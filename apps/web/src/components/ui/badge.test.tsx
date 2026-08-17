import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "./badge";

describe("Badge — Design System Checkpoint B (convergence vers les jetons sémantiques)", () => {
  it("BLOQUANT — success/warning/danger/info tones consume the Checkpoint A semantic tokens, never a raw Tailwind color class", () => {
    const { rerender } = render(<Badge tone="success">GO</Badge>);
    expect(screen.getByText("GO").className).toContain("bg-success-bg");
    expect(screen.getByText("GO").className).toContain("text-success-fg");
    expect(screen.getByText("GO").className).not.toMatch(/bg-green-\d/);

    rerender(<Badge tone="warning">À revoir</Badge>);
    expect(screen.getByText("À revoir").className).toContain("bg-warning-bg");
    expect(screen.getByText("À revoir").className).not.toMatch(/bg-amber-\d/);

    rerender(<Badge tone="danger">NO-GO</Badge>);
    expect(screen.getByText("NO-GO").className).toContain("bg-danger-bg");
    expect(screen.getByText("NO-GO").className).not.toMatch(/bg-red-\d/);

    rerender(<Badge tone="info">Nouveau</Badge>);
    expect(screen.getByText("Nouveau").className).toContain("bg-info-bg");
  });

  it("never renders a bare color pill — the text label is always present", () => {
    render(<Badge tone="success">Terminé</Badge>);
    expect(screen.getByText("Terminé")).toBeInTheDocument();
  });
});
