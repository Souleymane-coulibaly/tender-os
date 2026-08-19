import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SubmissionSection } from "./submission-section";
import type { TenderSubmissionCapabilities, TenderSubmissionReadinessResult, TenderSubmissionSummary } from "../../../../../../lib/submission-types";

const recordTenderSubmissionAction = vi.fn(async (_tenderId: string, _input: unknown) => ({ error: undefined as string | undefined, submission: undefined as TenderSubmissionSummary | undefined }));
const confirmSubmissionReceiptAction = vi.fn(async (_tenderId: string, _submissionId: string, _input: unknown) => ({ error: undefined as string | undefined, submission: undefined as TenderSubmissionSummary | undefined }));

vi.mock("../../../../submission-actions", () => ({
  recordTenderSubmissionAction: (tenderId: string, input: unknown) => recordTenderSubmissionAction(tenderId, input),
  confirmSubmissionReceiptAction: (tenderId: string, submissionId: string, input: unknown) => confirmSubmissionReceiptAction(tenderId, submissionId, input),
  cancelTenderSubmissionAction: vi.fn(async () => ({ error: undefined, submission: undefined })),
  replaceTenderSubmissionAction: vi.fn(async () => ({ error: undefined, submission: undefined })),
  recordSubmissionRejectionAction: vi.fn(async () => ({ error: undefined, submission: undefined })),
  uploadSubmissionProofAction: vi.fn(async () => ({ error: undefined, submission: undefined })),
  withdrawTenderSubmissionAction: vi.fn(async () => ({ error: undefined, submission: undefined })),
}));

function readiness(overrides: Partial<TenderSubmissionReadinessResult> = {}): TenderSubmissionReadinessResult {
  return {
    canSubmit: true,
    readinessStatus: "READY_FOR_SUBMISSION",
    blockers: [],
    warnings: [],
    requiredActions: [],
    packageId: "pkg-1",
    packageVersion: 3,
    packageHash: "a".repeat(64),
    signatureRequirement: "SATISFIED_OR_NOT_REQUIRED",
    validationSummary: "READY_FOR_SUBMISSION",
    fileReadinessReasons: [],
    ...overrides,
  };
}

function capabilities(overrides: Partial<TenderSubmissionCapabilities> = {}): TenderSubmissionCapabilities {
  return {
    canViewSubmission: true,
    canPrepareSubmission: true,
    canRecordSubmission: true,
    canUploadProof: false,
    canConfirmReceipt: false,
    canReplaceSubmission: false,
    canWithdrawSubmission: false,
    canCancelSubmission: false,
    canRecordRejection: false,
    readiness: readiness(),
    blockers: [],
    warnings: [],
    availableActions: [],
    reasonsByAction: {},
    ...overrides,
  };
}

function submission(overrides: Partial<TenderSubmissionSummary> = {}): TenderSubmissionSummary {
  return {
    id: "sub-1",
    tenderId: "tender-1",
    packageId: "pkg-1",
    packageVersion: 3,
    packageHash: "a".repeat(64),
    status: "SUBMITTED",
    platform: "PLACE",
    createdAt: "2026-09-10T10:00:00.000Z",
    updatedAt: "2026-09-10T10:00:00.000Z",
    proofs: [],
    ...overrides,
  };
}

describe("SubmissionSection", () => {
  it("renders the readiness blockers and warnings from the backend, never a frontend-invented status", () => {
    render(
      <SubmissionSection
        tenderId="tender-1"
        initialReadiness={readiness({ readinessStatus: "BLOCKED", blockers: ["Le package final est introuvable."] })}
        initialCapabilities={capabilities({ canRecordSubmission: false, reasonsByAction: { canRecordSubmission: "Le dossier n'est pas prêt pour le dépôt." } })}
        initialSubmissions={[]}
      />,
    );
    expect(screen.getByText("Le package final est introuvable.")).toBeInTheDocument();
  });

  it("Checkpoint 2.1-P2.1-FIX-F — displays a structured file-readiness reason with a backend-provided action link, deduplicated from the plain blockers list", () => {
    render(
      <SubmissionSection
        tenderId="tender-1"
        initialReadiness={readiness({
          readinessStatus: "BLOCKED",
          blockers: ["L'analyse du DCE n'est plus à jour par rapport au DCE courant."],
          fileReadinessReasons: [
            { code: "ANALYSIS_STALE", severity: "BLOCKING", source: "ANALYSIS", message: "L'analyse du DCE n'est plus à jour par rapport au DCE courant.", action: "REANALYZE_DCE" },
          ],
        })}
        initialCapabilities={capabilities({ canRecordSubmission: false, reasonsByAction: { canRecordSubmission: "Le dossier n'est pas prêt pour le dépôt." } })}
        initialSubmissions={[]}
      />,
    );

    expect(screen.getByText("Dossier non prêt")).toBeInTheDocument();
    expect(screen.getAllByText("L'analyse du DCE n'est plus à jour par rapport au DCE courant.")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Relancer l'analyse du DCE" })).toHaveAttribute("href", "/app/tenders/tender-1/analysis");
  });

  it("records a submission with the read-only package pinned from readiness, never a freely chosen one", async () => {
    recordTenderSubmissionAction.mockResolvedValueOnce({ error: undefined, submission: submission() });
    const user = userEvent.setup();

    render(<SubmissionSection tenderId="tender-1" initialReadiness={readiness()} initialCapabilities={capabilities()} initialSubmissions={[]} />);
    await user.click(screen.getByRole("button", { name: "Enregistrer le dépôt" }));

    expect(recordTenderSubmissionAction).toHaveBeenCalledWith("tender-1", expect.objectContaining({ packageId: "pkg-1" }));
  });

  it("mission §15 — displays the manual-withdrawal warning text, never claiming an automatic buyer-platform withdrawal", () => {
    render(
      <SubmissionSection
        tenderId="tender-1"
        initialReadiness={readiness()}
        initialCapabilities={capabilities({ canWithdrawSubmission: true, activeSubmissionId: "sub-1" })}
        initialSubmissions={[submission()]}
      />,
    );
    expect(screen.getByText(/ne réalise pas automatiquement le retrait sur la plateforme acheteur/)).toBeInTheDocument();
  });

  it("mission §13 (correctif audit Codex P2) — disables receipt confirmation without evidence until the actor explicitly ticks the confirmation checkbox", async () => {
    const user = userEvent.setup();
    render(
      <SubmissionSection
        tenderId="tender-1"
        initialReadiness={readiness()}
        initialCapabilities={capabilities({ canConfirmReceipt: true, activeSubmissionId: "sub-1" })}
        initialSubmissions={[submission({ proofs: [] })]}
      />,
    );

    const confirmButton = screen.getByRole("button", { name: "Confirmer le reçu" });
    expect(confirmButton).toBeDisabled();

    await user.click(screen.getByRole("checkbox", { name: /confirme explicitement/ }));
    expect(confirmButton).toBeEnabled();

    confirmSubmissionReceiptAction.mockResolvedValueOnce({ error: undefined, submission: submission({ status: "RECEIPT_CONFIRMED" }) });
    await user.click(confirmButton);
    expect(confirmSubmissionReceiptAction).toHaveBeenCalledWith("tender-1", "sub-1", expect.objectContaining({ confirmedWithoutEvidence: true }));
  });
});
