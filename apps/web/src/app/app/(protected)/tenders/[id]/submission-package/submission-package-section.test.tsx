import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SubmissionPackageSection } from "./submission-package-section";
import type { SubmissionPackageSummary } from "../../../../../../lib/submission-package-types";

const createSubmissionPackageAction = vi.fn(async (_tenderId: string) => ({ error: undefined as string | undefined, pkg: undefined as SubmissionPackageSummary | undefined }));

vi.mock("../../../../submission-package-actions", () => ({
  createSubmissionPackageAction: (tenderId: string) => createSubmissionPackageAction(tenderId),
}));

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));

function pkg(overrides: Partial<SubmissionPackageSummary> = {}): SubmissionPackageSummary {
  return {
    id: "package-1",
    tenderId: "tender-1",
    version: 1,
    status: "COMPLETED",
    validationRunId: "run-1",
    approvalId: "approval-1",
    readinessStatus: "READY_FOR_SUBMISSION",
    files: [{ archivePath: "memoire.pdf", sourceType: "EXPORT_ARTIFACT", fileName: "memoire.pdf", mimeType: "application/pdf", fileSize: 1024, fileHash: "a".repeat(64), order: 0 }],
    createdAt: "2026-09-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("SubmissionPackageSection", () => {
  it("creates a package by calling createSubmissionPackageAction with the tender id", async () => {
    createSubmissionPackageAction.mockResolvedValueOnce({ error: undefined, pkg: pkg() });
    const user = userEvent.setup();

    render(<SubmissionPackageSection tenderId="tender-1" initialPackages={[]} actorRole="OWNER" />);
    await user.click(screen.getByRole("button", { name: "Constituer le package" }));

    expect(createSubmissionPackageAction).toHaveBeenCalledWith("tender-1");
    expect(refreshMock).toHaveBeenCalled();
  });

  it("displays the backend error (e.g. not-ready readiness) instead of a silent failure", async () => {
    createSubmissionPackageAction.mockResolvedValueOnce({
      error: "Le dossier n'est pas encore prêt : une approbation finale active et, le cas échéant, une signature vérifiée sont requises.",
      pkg: undefined,
    });
    const user = userEvent.setup();

    render(<SubmissionPackageSection tenderId="tender-1" initialPackages={[]} actorRole="OWNER" />);
    await user.click(screen.getByRole("button", { name: "Constituer le package" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/pas encore prêt/);
  });

  it("lists package history with a real download link, never for a non-COMPLETED package", () => {
    render(<SubmissionPackageSection tenderId="tender-1" initialPackages={[pkg({ id: "package-2", version: 2, status: "FAILED", errorMessage: "boom" }), pkg()]} actorRole="OWNER" />);

    expect(screen.getByText("Version 2")).toBeInTheDocument();
    expect(screen.getByText("boom")).toBeInTheDocument();
    const links = screen.getAllByRole("link", { name: "Télécharger le ZIP" });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/app/tenders/tender-1/submission-package/package-1/download");
  });

  it("hides the create button for a role that cannot create a submission package", () => {
    render(<SubmissionPackageSection tenderId="tender-1" initialPackages={[]} actorRole="CONTRIBUTOR" />);
    expect(screen.queryByRole("button", { name: "Constituer le package" })).not.toBeInTheDocument();
  });
});
