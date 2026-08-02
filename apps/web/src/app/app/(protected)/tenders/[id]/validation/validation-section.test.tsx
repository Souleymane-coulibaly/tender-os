import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ValidationSection } from "./validation-section";
import type { ReadinessStatusResult, ValidationRunSummary } from "../../../../../../lib/validation-types";
import type { ExportJobSummary } from "../../../../../../lib/export-types";

const runFinalValidationAction = vi.fn(async (_tenderId: string, _exportJobId: string) => ({ error: undefined as string | undefined }));
const resolveValidationIssueAction = vi.fn(async (_tenderId: string, _issueId: string, _note: string) => ({ error: undefined as string | undefined }));
const reopenValidationIssueAction = vi.fn(async (_tenderId: string, _issueId: string, _note: string) => ({ error: undefined as string | undefined }));
const approveFinalVersionAction = vi.fn(async (_tenderId: string, _validationRunId: string, _comment: string | undefined) => ({ error: undefined as string | undefined }));
const reopenFinalVersionAction = vi.fn(async (_tenderId: string, _reason: string) => ({ error: undefined as string | undefined }));

vi.mock("../../../../validation-actions", () => ({
  runFinalValidationAction: (tenderId: string, exportJobId: string) => runFinalValidationAction(tenderId, exportJobId),
  resolveValidationIssueAction: (tenderId: string, issueId: string, note: string) => resolveValidationIssueAction(tenderId, issueId, note),
  reopenValidationIssueAction: (tenderId: string, issueId: string, note: string) => reopenValidationIssueAction(tenderId, issueId, note),
  approveFinalVersionAction: (tenderId: string, validationRunId: string, comment: string | undefined) => approveFinalVersionAction(tenderId, validationRunId, comment),
  reopenFinalVersionAction: (tenderId: string, reason: string) => reopenFinalVersionAction(tenderId, reason),
}));

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));

function readiness(overrides: Partial<ReadinessStatusResult> = {}): ReadinessStatusResult {
  return { status: "NOT_READY", ...overrides };
}

function run(overrides: Partial<ValidationRunSummary> = {}): ValidationRunSummary {
  return { id: "run-1", tenderId: "tender-1", exportJobId: "export-1", readinessStatus: "READY_FOR_APPROVAL", runBy: "user-1", runAt: "2026-09-01T10:00:00.000Z", issues: [], ...overrides };
}

function previewJob(): ExportJobSummary {
  return { id: "export-1", organizationId: "org-1", clientAccountId: "client-1", tenderId: "tender-1", exportTemplateId: "t", exportTemplateVersionId: "v", documentType: "TECHNICAL_MEMO", mode: "PREVIEW", format: "DOCX", status: "COMPLETED", version: 1, createdBy: "user-1", createdAt: "2026-09-01T09:00:00.000Z" };
}

describe("ValidationSection", () => {
  it("launches a validation run against the selected preview export", async () => {
    runFinalValidationAction.mockResolvedValueOnce({ error: undefined });
    const user = userEvent.setup();

    render(<ValidationSection tenderId="tender-1" readiness={readiness()} run={undefined} completedPreviews={[previewJob()]} actorRole="OWNER" />);
    await user.click(screen.getByRole("button", { name: "Lancer la validation" }));

    expect(runFinalValidationAction).toHaveBeenCalledWith("tender-1", "export-1");
    expect(refreshMock).toHaveBeenCalled();
  });

  it("displays the backend error when running validation fails", async () => {
    runFinalValidationAction.mockResolvedValueOnce({ error: "Export introuvable." });
    const user = userEvent.setup();

    render(<ValidationSection tenderId="tender-1" readiness={readiness()} run={undefined} completedPreviews={[previewJob()]} actorRole="OWNER" />);
    await user.click(screen.getByRole("button", { name: "Lancer la validation" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Export introuvable.");
  });

  it("resolving a blocking issue requires a justification and calls resolveValidationIssueAction", async () => {
    const blockingIssue = { id: "issue-1", ruleCode: "MANDATORY_SECTION_MISSING", severity: "BLOCKING", message: "Section obligatoire manquante", detectedAt: "2026-09-01T10:00:00.000Z", resolutionStatus: "OPEN" };
    resolveValidationIssueAction.mockResolvedValueOnce({ error: undefined });
    const user = userEvent.setup();

    render(<ValidationSection tenderId="tender-1" readiness={readiness({ status: "BLOCKED" })} run={run({ issues: [blockingIssue] })} completedPreviews={[]} actorRole="OWNER" />);

    await user.click(screen.getByRole("button", { name: "Résoudre" }));
    expect(await screen.findByText("Une justification est requise.")).toBeInTheDocument();
    expect(resolveValidationIssueAction).not.toHaveBeenCalled();

    await user.type(screen.getByPlaceholderText("Justification"), "Section ajoutée manuellement.");
    await user.click(screen.getByRole("button", { name: "Résoudre" }));

    expect(resolveValidationIssueAction).toHaveBeenCalledWith("tender-1", "issue-1", "Section ajoutée manuellement.");
  });

  it("approves the final version by calling approveFinalVersionAction with the run id", async () => {
    approveFinalVersionAction.mockResolvedValueOnce({ error: undefined });
    const user = userEvent.setup();

    render(<ValidationSection tenderId="tender-1" readiness={readiness({ status: "READY_FOR_APPROVAL" })} run={run()} completedPreviews={[]} actorRole="OWNER" />);
    await user.click(screen.getByRole("button", { name: "Approuver la version finale" }));

    expect(approveFinalVersionAction).toHaveBeenCalledWith("tender-1", "run-1", undefined);
  });

  it("never shows the approve button while a blocking issue is still open", () => {
    const blockingIssue = { id: "issue-1", ruleCode: "MANDATORY_SECTION_MISSING", severity: "BLOCKING", message: "Section obligatoire manquante", detectedAt: "2026-09-01T10:00:00.000Z", resolutionStatus: "OPEN" };
    render(<ValidationSection tenderId="tender-1" readiness={readiness({ status: "BLOCKED" })} run={run({ issues: [blockingIssue] })} completedPreviews={[]} actorRole="OWNER" />);

    const approveButton = screen.getByRole("button", { name: "Approuver la version finale" });
    expect(approveButton).toBeDisabled();
  });
});
