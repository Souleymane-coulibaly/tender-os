import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OverlayDeliverable } from "./overlay-deliverable";
import type { DeliverableSummary } from "../../../../../../../lib/deliverable-types";

const createDeliverableAnnexAction = vi.fn(async (_tenderId: string, _deliverableId: string, _input: { label: string; source?: string }) => ({}));
const updateDeliverableAnnexAction = vi.fn(
  async (_tenderId: string, _deliverableId: string, _annexId: string, _input: { documentId: string; version?: string }) => ({}),
);

vi.mock("../../../../../deliverable-actions", () => ({
  createChecklistPieceEntryAction: vi.fn(async () => ({})),
  createComplianceMatrixEntryAction: vi.fn(async () => ({})),
  updateComplianceMatrixEntryAction: vi.fn(async () => ({})),
  createDeliverableAnnexAction: (tenderId: string, deliverableId: string, input: { label: string; source?: string }) =>
    createDeliverableAnnexAction(tenderId, deliverableId, input),
  updateDeliverableAnnexAction: (tenderId: string, deliverableId: string, annexId: string, input: { documentId: string; version?: string }) =>
    updateDeliverableAnnexAction(tenderId, deliverableId, annexId, input),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

function annexesDeliverable(): DeliverableSummary {
  return {
    id: "deliverable-1",
    organizationId: "org-1",
    clientAccountId: "client-1",
    tenderId: "tender-1",
    type: "ANNEXES",
    status: "NOT_STARTED",
    createdBy: "user-1",
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T10:00:00.000Z",
  } as DeliverableSummary;
}

describe("OverlayDeliverable — Annexes (mission correctif 'aucun moyen de faire avancer le statut d'une annexe')", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a document picker and an Attacher button for a PENDING annex when documents are available", () => {
    render(
      <OverlayDeliverable
        tenderId="tender-1"
        deliverable={annexesDeliverable()}
        actorRole="OWNER"
        annexEntries={[{ id: "annex-1", label: "CV chef de projet", status: "PENDING" }]}
        availableDocuments={[{ id: "doc-1", title: "CV Jean Dupont.pdf" }]}
      />,
    );

    expect(screen.getByText("CV chef de projet")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "CV Jean Dupont.pdf" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Attacher" })).toBeDisabled();
  });

  it("attaches the selected document and calls updateDeliverableAnnexAction with the annex id and documentId", async () => {
    const user = userEvent.setup();
    render(
      <OverlayDeliverable
        tenderId="tender-1"
        deliverable={annexesDeliverable()}
        actorRole="OWNER"
        annexEntries={[{ id: "annex-1", label: "CV chef de projet", status: "PENDING" }]}
        availableDocuments={[{ id: "doc-1", title: "CV Jean Dupont.pdf" }]}
      />,
    );

    await user.selectOptions(screen.getByRole("combobox"), "doc-1");
    await user.click(screen.getByRole("button", { name: "Attacher" }));

    expect(updateDeliverableAnnexAction).toHaveBeenCalledWith("tender-1", "deliverable-1", "annex-1", { documentId: "doc-1" });
  });

  it("never shows the picker for an annex that is already PROVIDED — the only real path to progress is already used", () => {
    render(
      <OverlayDeliverable
        tenderId="tender-1"
        deliverable={annexesDeliverable()}
        actorRole="OWNER"
        annexEntries={[{ id: "annex-1", label: "CV chef de projet", status: "PROVIDED" }]}
        availableDocuments={[{ id: "doc-1", title: "CV Jean Dupont.pdf" }]}
      />,
    );

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Attacher" })).not.toBeInTheDocument();
  });

  it("explains there is nothing to attach yet when no organization document exists", () => {
    render(
      <OverlayDeliverable
        tenderId="tender-1"
        deliverable={annexesDeliverable()}
        actorRole="OWNER"
        annexEntries={[{ id: "annex-1", label: "CV chef de projet", status: "PENDING" }]}
        availableDocuments={[]}
      />,
    );

    expect(screen.getByText(/Aucun document disponible/)).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("never shows the picker for a read-only actor (canManageDeliverable = false)", () => {
    render(
      <OverlayDeliverable
        tenderId="tender-1"
        deliverable={annexesDeliverable()}
        actorRole="READ_ONLY"
        annexEntries={[{ id: "annex-1", label: "CV chef de projet", status: "PENDING" }]}
        availableDocuments={[{ id: "doc-1", title: "CV Jean Dupont.pdf" }]}
      />,
    );

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
