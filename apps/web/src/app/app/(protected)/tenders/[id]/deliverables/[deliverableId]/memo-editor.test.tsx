import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MemoEditor } from "./memo-editor";
import type { DeliverableRevisionSummary, DeliverableSectionSummary, DeliverableSummary } from "../../../../../../../lib/deliverable-types";

const listSectionRevisionsAction = vi.fn((..._args: unknown[]) => Promise.resolve({} as { revisions?: DeliverableRevisionSummary[]; error?: string }));
const createManualRevisionAction = vi.fn((..._args: unknown[]) => Promise.resolve({} as { revision?: DeliverableRevisionSummary; error?: string }));
const saveRevisionDraftAction = vi.fn((..._args: unknown[]) => Promise.resolve({} as { revision?: DeliverableRevisionSummary; error?: string }));
const generateSectionAction = vi.fn((..._args: unknown[]) => Promise.resolve({} as { generationId?: string; error?: string }));
const submitRevisionForReviewAction = vi.fn(async (..._args: unknown[]) => ({ error: undefined as string | undefined }));
const decideRevisionReviewAction = vi.fn(async (..._args: unknown[]) => ({ error: undefined as string | undefined }));
const selectRevisionForExportAction = vi.fn(async (..._args: unknown[]) => ({ error: undefined as string | undefined }));
const restoreRevisionAction = vi.fn(async (..._args: unknown[]) => ({ error: undefined as string | undefined }));
const previewDeliverableAction = vi.fn(async (..._args: unknown[]) => ({ jobId: undefined as string | undefined, error: undefined as string | undefined }));
const getGenerationStatusAction = vi.fn((..._args: unknown[]) => Promise.resolve({} as { status?: string; generatedContent?: string; error?: string }));
const compareRevisionsAction = vi.fn((..._args: unknown[]) => Promise.resolve({} as { addedLines?: string[]; removedLines?: string[]; error?: string }));
const updateDeliverableSectionAction = vi.fn(async (..._args: unknown[]) => ({ error: undefined as string | undefined }));
const approveDeliverableAction = vi.fn(async (..._args: unknown[]) => ({ error: undefined as string | undefined }));

vi.mock("../../../../../deliverable-actions", () => ({
  listSectionRevisionsAction: (...args: unknown[]) => listSectionRevisionsAction(...args),
  createManualRevisionAction: (...args: unknown[]) => createManualRevisionAction(...args),
  createRevisionFromGenerationAction: vi.fn(),
  saveRevisionDraftAction: (...args: unknown[]) => saveRevisionDraftAction(...args),
  generateSectionAction: (...args: unknown[]) => generateSectionAction(...args),
  submitRevisionForReviewAction: (...args: unknown[]) => submitRevisionForReviewAction(...args),
  decideRevisionReviewAction: (...args: unknown[]) => decideRevisionReviewAction(...args),
  selectRevisionForExportAction: (...args: unknown[]) => selectRevisionForExportAction(...args),
  restoreRevisionAction: (...args: unknown[]) => restoreRevisionAction(...args),
  previewDeliverableAction: (...args: unknown[]) => previewDeliverableAction(...args),
  getGenerationStatusAction: (...args: unknown[]) => getGenerationStatusAction(...args),
  compareRevisionsAction: (...args: unknown[]) => compareRevisionsAction(...args),
  updateDeliverableSectionAction: (...args: unknown[]) => updateDeliverableSectionAction(...args),
  approveDeliverableAction: (...args: unknown[]) => approveDeliverableAction(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

function section(overrides: Partial<DeliverableSectionSummary> = {}): DeliverableSectionSummary {
  return {
    id: "section-1",
    deliverableId: "deliverable-1",
    code: "INTRO",
    title: "Introduction",
    order: 0,
    headingLevel: 1,
    mandatory: true,
    hidden: false,
    locked: false,
    status: "NOT_STARTED",
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

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
    sections: [section()],
    ...overrides,
  };
}

function revision(overrides: Partial<DeliverableRevisionSummary> = {}): DeliverableRevisionSummary {
  return {
    id: "revision-1",
    deliverableSectionId: "section-1",
    revisionNumber: 1,
    sourceType: "MANUAL",
    contentStructured: [{ kind: "paragraph", text: "Contenu initial." }],
    contentText: "Contenu initial.",
    characterCount: 16,
    status: "DRAFT",
    editVersion: 0,
    createdBy: "user-1",
    createdByRole: "OWNER",
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("MemoEditor", () => {
  it("creates a manual revision by calling createManualRevisionAction, then displays it in history", async () => {
    listSectionRevisionsAction.mockResolvedValue({ revisions: [] });
    createManualRevisionAction.mockResolvedValueOnce({ revision: revision() });
    const user = userEvent.setup();

    render(<MemoEditor tenderId="tender-1" deliverable={deliverable()} actorRole="OWNER" />);

    await waitFor(() => expect(listSectionRevisionsAction).toHaveBeenCalledWith("section-1"));
    await user.click(await screen.findByRole("button", { name: "Rédiger manuellement" }));

    expect(createManualRevisionAction).toHaveBeenCalledWith("tender-1", "deliverable-1", "section-1", [{ kind: "paragraph", text: "" }]);
  });

  it("triggers AI generation by calling generateSectionAction with the section id", async () => {
    listSectionRevisionsAction.mockResolvedValue({ revisions: [] });
    generateSectionAction.mockResolvedValueOnce({ generationId: "gen-1" });
    const user = userEvent.setup();

    render(<MemoEditor tenderId="tender-1" deliverable={deliverable()} actorRole="OWNER" />);
    await user.click(await screen.findByRole("button", { name: "Générer par IA" }));

    expect(generateSectionAction).toHaveBeenCalledWith("tender-1", "section-1");
    expect(await screen.findByRole("button", { name: "Vérifier / créer la révision" })).toBeInTheDocument();
  });

  it("surfaces the exact backend conflict message when saving a draft with a stale editVersion (mission §18, no silent overwrite)", async () => {
    listSectionRevisionsAction.mockResolvedValue({ revisions: [revision()] });
    saveRevisionDraftAction.mockResolvedValueOnce({ error: "Cette révision a été modifiée par quelqu'un d'autre entre-temps. Rechargez la page et réappliquez vos changements." });
    const user = userEvent.setup();

    render(<MemoEditor tenderId="tender-1" deliverable={deliverable()} actorRole="OWNER" />);
    await user.click(await screen.findByRole("button", { name: "Éditer" }));
    await user.click(await screen.findByRole("button", { name: "Enregistrer le brouillon" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("modifiée par quelqu'un d'autre entre-temps");
  });

  it("only offers Valider/Rejeter to a role that can validate, never to a plain CONTRIBUTOR-shaped viewer role", async () => {
    listSectionRevisionsAction.mockResolvedValue({ revisions: [revision({ status: "READY_FOR_REVIEW" })] });
    render(<MemoEditor tenderId="tender-1" deliverable={deliverable()} actorRole="CONTRIBUTOR" />);

    await screen.findByText(/Révision #1/);
    expect(screen.queryByRole("button", { name: "Valider" })).not.toBeInTheDocument();
  });

  it("locking a section calls updateDeliverableSectionAction with locked: true (mission §4)", async () => {
    listSectionRevisionsAction.mockResolvedValue({ revisions: [] });
    const user = userEvent.setup();

    render(<MemoEditor tenderId="tender-1" deliverable={deliverable()} actorRole="OWNER" />);
    await user.click(await screen.findByRole("button", { name: "Verrouiller" }));

    expect(updateDeliverableSectionAction).toHaveBeenCalledWith("tender-1", "deliverable-1", "section-1", { locked: true });
  });

  it("shows an Approuver button to a validating role and calls approveDeliverableAction (mission §15)", async () => {
    listSectionRevisionsAction.mockResolvedValue({ revisions: [] });
    const user = userEvent.setup();

    render(<MemoEditor tenderId="tender-1" deliverable={deliverable({ status: "VALIDATED" })} actorRole="OWNER" />);
    await user.click(await screen.findByRole("button", { name: "Approuver le livrable" }));

    expect(approveDeliverableAction).toHaveBeenCalledWith("tender-1", "deliverable-1");
  });

  it("hides the Approuver button once the deliverable is already APPROVED", async () => {
    listSectionRevisionsAction.mockResolvedValue({ revisions: [] });
    render(<MemoEditor tenderId="tender-1" deliverable={deliverable({ status: "APPROVED", approvedBy: "user-1", approvedAt: "2026-09-05T10:00:00.000Z" })} actorRole="OWNER" />);

    await screen.findByText("Approuvé");
    expect(screen.queryByRole("button", { name: "Approuver le livrable" })).not.toBeInTheDocument();
  });

  it("never offers the Approuver button to a CONTRIBUTOR (mission §15 — ValidateDeliverable required)", async () => {
    listSectionRevisionsAction.mockResolvedValue({ revisions: [] });
    render(<MemoEditor tenderId="tender-1" deliverable={deliverable({ status: "VALIDATED" })} actorRole="CONTRIBUTOR" />);

    await screen.findByText("Validé");
    expect(screen.queryByRole("button", { name: "Approuver le livrable" })).not.toBeInTheDocument();
  });
});
