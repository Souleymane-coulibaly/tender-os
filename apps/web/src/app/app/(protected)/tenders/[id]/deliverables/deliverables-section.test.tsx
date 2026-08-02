import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DeliverablesSection } from "./deliverables-section";
import type { DeliverableSummary } from "../../../../../../lib/deliverable-types";

function deliverable(overrides: Partial<DeliverableSummary> = {}): DeliverableSummary {
  return {
    id: "deliverable-1",
    organizationId: "org-1",
    clientAccountId: "client-1",
    tenderId: "tender-1",
    type: "TECHNICAL_MEMO",
    status: "NOT_STARTED",
    createdBy: "user-1",
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("DeliverablesSection", () => {
  it("renders a card per deliverable, labeled in French, linking to its detail page", () => {
    render(<DeliverablesSection tenderId="tender-1" deliverables={[deliverable(), deliverable({ id: "deliverable-2", type: "EXECUTIVE_SUMMARY" })]} actorRole="OWNER" />);

    const memoLink = screen.getByRole("link", { name: /Mémoire technique/ });
    expect(memoLink).toHaveAttribute("href", "/app/tenders/tender-1/deliverables/deliverable-1");
    expect(screen.getByRole("link", { name: /Synthèse exécutive/ })).toHaveAttribute("href", "/app/tenders/tender-1/deliverables/deliverable-2");
  });

  it("shows the deliverable status badge, translated", () => {
    render(<DeliverablesSection tenderId="tender-1" deliverables={[deliverable({ status: "VALIDATED" })]} actorRole="OWNER" />);
    expect(screen.getByText("Validé")).toBeInTheDocument();
  });
});
