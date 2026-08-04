import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OverlayDeliverable } from "./overlay-deliverable";
import type { DeliverableSummary } from "../../../../../../../lib/deliverable-types";

const createDeliverableAnnexAction = vi.fn(async (_tenderId: string, _deliverableId: string, _input: { label: string; source?: string }) => ({}));
const updateDeliverableAnnexAction = vi.fn(
  async (_tenderId: string, _deliverableId: string, _annexId: string, _input: { documentId: string; version?: string }) => ({}),
);
const updateComplianceMatrixEntryAction = vi.fn(
  async (_tenderId: string, _deliverableId: string, _entryId: string, _input: { response?: string; coverageStatus?: string }) => ({}),
);
const updateChecklistPieceEntryAction = vi.fn(
  async (_tenderId: string, _deliverableId: string, _entryId: string, _input: { documentId: string; version?: string }) => ({}),
);

vi.mock("../../../../../deliverable-actions", () => ({
  createChecklistPieceEntryAction: vi.fn(async () => ({})),
  updateChecklistPieceEntryAction: (tenderId: string, deliverableId: string, entryId: string, input: { documentId: string; version?: string }) =>
    updateChecklistPieceEntryAction(tenderId, deliverableId, entryId, input),
  createComplianceMatrixEntryAction: vi.fn(async () => ({})),
  updateComplianceMatrixEntryAction: (tenderId: string, deliverableId: string, entryId: string, input: { response?: string; coverageStatus?: string }) =>
    updateComplianceMatrixEntryAction(tenderId, deliverableId, entryId, input),
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

function complianceDeliverable(): DeliverableSummary {
  return {
    id: "deliverable-2",
    organizationId: "org-1",
    clientAccountId: "client-1",
    tenderId: "tender-1",
    type: "COMPLIANCE_MATRIX",
    status: "NOT_STARTED",
    createdBy: "user-1",
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T10:00:00.000Z",
  } as DeliverableSummary;
}

describe("OverlayDeliverable — Matrice de conformité (mission correctif 'coverageStatus toujours forcé à COVERED')", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lets the user pick the real coverage status instead of it being forced to COVERED", async () => {
    const user = userEvent.setup();
    render(
      <OverlayDeliverable
        tenderId="tender-1"
        deliverable={complianceDeliverable()}
        actorRole="OWNER"
        complianceEntries={[{ id: "entry-1", source: "CCTP art. 3.2", mandatory: true, criticality: "MEDIUM", coverageStatus: "TO_CONFIRM", response: "oui" }]}
      />,
    );

    await user.selectOptions(screen.getByRole("combobox"), "NOT_COVERED");

    expect(updateComplianceMatrixEntryAction).toHaveBeenCalledWith("tender-1", "deliverable-2", "entry-1", { coverageStatus: "NOT_COVERED" });
  });

  it("no longer sends coverageStatus at all when only the response text changes", async () => {
    const user = userEvent.setup();
    render(
      <OverlayDeliverable
        tenderId="tender-1"
        deliverable={complianceDeliverable()}
        actorRole="OWNER"
        complianceEntries={[{ id: "entry-1", source: "CCTP art. 3.2", mandatory: true, criticality: "MEDIUM", coverageStatus: "NOT_COVERED", response: "" }]}
      />,
    );

    // index 0 = le champ "Ajouter une exigence", index 1 = le champ Réponse de la ligne.
    const responseInput = screen.getAllByRole("textbox")[1]!;
    await user.type(responseInput, "oui");
    await user.tab();

    expect(updateComplianceMatrixEntryAction).toHaveBeenCalledWith("tender-1", "deliverable-2", "entry-1", { response: "oui" });
  });

  it("shows the coverage status translated in French for a read-only actor, never a raw select", () => {
    render(
      <OverlayDeliverable
        tenderId="tender-1"
        deliverable={complianceDeliverable()}
        actorRole="READ_ONLY"
        complianceEntries={[{ id: "entry-1", source: "CCTP art. 3.2", mandatory: true, criticality: "MEDIUM", coverageStatus: "PARTIALLY_COVERED", response: "oui" }]}
      />,
    );

    expect(screen.getByText("Partiellement couvert")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});

function checklistDeliverable(): DeliverableSummary {
  return {
    id: "deliverable-3",
    organizationId: "org-1",
    clientAccountId: "client-1",
    tenderId: "tender-1",
    type: "CHECKLIST",
    status: "NOT_STARTED",
    createdBy: "user-1",
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T10:00:00.000Z",
  } as DeliverableSummary;
}

describe("OverlayDeliverable — Checklist (mission correctif 'aucun moyen de faire avancer le statut d'une pièce')", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a document picker and an Attacher button for a MISSING piece when documents are available", () => {
    render(
      <OverlayDeliverable
        tenderId="tender-1"
        deliverable={checklistDeliverable()}
        actorRole="OWNER"
        checklistEntries={[{ id: "piece-1", name: "attestation fiscale", mandatory: true, status: "MISSING" }]}
        availableDocuments={[{ id: "doc-1", title: "Attestation fiscale 2026.pdf" }]}
      />,
    );

    expect(screen.getByText("attestation fiscale")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Attestation fiscale 2026.pdf" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Attacher" })).toBeDisabled();
  });

  it("attaches the selected document and calls updateChecklistPieceEntryAction with the entry id and documentId", async () => {
    const user = userEvent.setup();
    render(
      <OverlayDeliverable
        tenderId="tender-1"
        deliverable={checklistDeliverable()}
        actorRole="OWNER"
        checklistEntries={[{ id: "piece-1", name: "attestation fiscale", mandatory: true, status: "MISSING" }]}
        availableDocuments={[{ id: "doc-1", title: "Attestation fiscale 2026.pdf" }]}
      />,
    );

    await user.selectOptions(screen.getByRole("combobox"), "doc-1");
    await user.click(screen.getByRole("button", { name: "Attacher" }));

    expect(updateChecklistPieceEntryAction).toHaveBeenCalledWith("tender-1", "deliverable-3", "piece-1", { documentId: "doc-1" });
  });

  it("never shows the picker for a piece that is already PROVIDED", () => {
    render(
      <OverlayDeliverable
        tenderId="tender-1"
        deliverable={checklistDeliverable()}
        actorRole="OWNER"
        checklistEntries={[{ id: "piece-1", name: "attestation fiscale", mandatory: true, status: "PROVIDED" }]}
        availableDocuments={[{ id: "doc-1", title: "Attestation fiscale 2026.pdf" }]}
      />,
    );

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Attacher" })).not.toBeInTheDocument();
  });

  it("explains there is nothing to attach yet when no organization document exists", () => {
    render(
      <OverlayDeliverable
        tenderId="tender-1"
        deliverable={checklistDeliverable()}
        actorRole="OWNER"
        checklistEntries={[{ id: "piece-1", name: "attestation fiscale", mandatory: true, status: "MISSING" }]}
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
        deliverable={checklistDeliverable()}
        actorRole="READ_ONLY"
        checklistEntries={[{ id: "piece-1", name: "attestation fiscale", mandatory: true, status: "MISSING" }]}
        availableDocuments={[{ id: "doc-1", title: "Attestation fiscale 2026.pdf" }]}
      />,
    );

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
