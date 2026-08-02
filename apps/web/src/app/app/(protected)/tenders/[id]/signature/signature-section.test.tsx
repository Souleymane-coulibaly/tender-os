import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SignatureSection } from "./signature-section";
import type { SignatorySummary, SignatureRequirementSummary, SignatureTransactionSummary } from "../../../../../../lib/signature-types";
import type { ExportJobSummary } from "../../../../../../lib/export-types";

const detectSignatureRequirementAction = vi.fn(async (_tenderId: string, _input: unknown) => ({ error: undefined as string | undefined }));
const confirmSignatureRequirementAction = vi.fn(async (_tenderId: string, _requirementId: string) => ({ error: undefined as string | undefined }));
const rejectSignatureRequirementAction = vi.fn(async (_tenderId: string, _requirementId: string) => ({ error: undefined as string | undefined }));
const registerSignatoryAction = vi.fn(async (_tenderId: string, _input: unknown) => ({ error: undefined as string | undefined }));
const verifySignatoryAction = vi.fn(async (_tenderId: string, _signatoryId: string, _approved: boolean) => ({ error: undefined as string | undefined }));
const prepareSignatureTransactionAction = vi.fn(async (_tenderId: string, _exportJobId: string, _signatoryIds: string[]) => ({ error: undefined as string | undefined }));
const startSignatureTransactionAction = vi.fn(async (_tenderId: string, _transactionId: string, _returnUrl: string) => ({ error: undefined as string | undefined }));
const syncSignatureTransactionAction = vi.fn(async (_tenderId: string, _transactionId: string) => ({ error: undefined as string | undefined }));
const retrieveSignedArtifactsAction = vi.fn(async (_tenderId: string, _transactionId: string) => ({ error: undefined as string | undefined }));
const verifySignedDocumentIntegrityAction = vi.fn(async (_tenderId: string, _transactionId: string) => ({ error: undefined as string | undefined }));
const importSignedDocumentAction = vi.fn(async (_tenderId: string, _transactionId: string, _formData: FormData) => ({ error: undefined as string | undefined }));

vi.mock("../../../../signature-actions", () => ({
  detectSignatureRequirementAction: (tenderId: string, input: unknown) => detectSignatureRequirementAction(tenderId, input),
  confirmSignatureRequirementAction: (tenderId: string, requirementId: string) => confirmSignatureRequirementAction(tenderId, requirementId),
  rejectSignatureRequirementAction: (tenderId: string, requirementId: string) => rejectSignatureRequirementAction(tenderId, requirementId),
  registerSignatoryAction: (tenderId: string, input: unknown) => registerSignatoryAction(tenderId, input),
  verifySignatoryAction: (tenderId: string, signatoryId: string, approved: boolean) => verifySignatoryAction(tenderId, signatoryId, approved),
  prepareSignatureTransactionAction: (tenderId: string, exportJobId: string, signatoryIds: string[]) => prepareSignatureTransactionAction(tenderId, exportJobId, signatoryIds),
  startSignatureTransactionAction: (tenderId: string, transactionId: string, returnUrl: string) => startSignatureTransactionAction(tenderId, transactionId, returnUrl),
  syncSignatureTransactionAction: (tenderId: string, transactionId: string) => syncSignatureTransactionAction(tenderId, transactionId),
  retrieveSignedArtifactsAction: (tenderId: string, transactionId: string) => retrieveSignedArtifactsAction(tenderId, transactionId),
  verifySignedDocumentIntegrityAction: (tenderId: string, transactionId: string) => verifySignedDocumentIntegrityAction(tenderId, transactionId),
  importSignedDocumentAction: (tenderId: string, transactionId: string, formData: FormData) => importSignedDocumentAction(tenderId, transactionId, formData),
}));

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));

function requirement(overrides: Partial<SignatureRequirementSummary> = {}): SignatureRequirementSummary {
  return { id: "req-1", tenderId: "tender-1", documentRef: "Acte d'engagement", mandatory: true, confidence: "MEDIUM", status: "DETECTED", createdAt: "2026-09-01T10:00:00.000Z", ...overrides };
}

function signatory(overrides: Partial<SignatorySummary> = {}): SignatorySummary {
  return { id: "signatory-1", tenderId: "tender-1", firstName: "Alice", lastName: "Dupont", professionalEmail: "alice.dupont@example.com", status: "PENDING", createdAt: "2026-09-01T10:00:00.000Z", ...overrides };
}

function transaction(overrides: Partial<SignatureTransactionSummary> = {}): SignatureTransactionSummary {
  return {
    id: "tx-1",
    tenderId: "tender-1",
    exportArtifactId: "artifact-1",
    provider: "FAKE",
    status: "PREPARING",
    documentHash: "a".repeat(64),
    createdAt: "2026-09-01T10:00:00.000Z",
    participants: [],
    artifacts: [],
    ...overrides,
  };
}

function finalExport(): ExportJobSummary {
  return { id: "export-final-1", organizationId: "org-1", clientAccountId: "client-1", tenderId: "tender-1", exportTemplateId: "t", exportTemplateVersionId: "v", documentType: "TECHNICAL_MEMO", mode: "FINAL", format: "PDF", status: "COMPLETED", version: 1, createdBy: "user-1", createdAt: "2026-09-01T09:00:00.000Z" };
}

describe("SignatureSection", () => {
  it("confirms a detected requirement by calling confirmSignatureRequirementAction", async () => {
    confirmSignatureRequirementAction.mockResolvedValueOnce({ error: undefined });
    const user = userEvent.setup();

    render(<SignatureSection tenderId="tender-1" initialRequirements={[requirement()]} initialSignatories={[]} initialTransactions={[]} finalExports={[]} actorRole="OWNER" />);
    await user.click(screen.getByRole("button", { name: "Confirmer" }));

    expect(confirmSignatureRequirementAction).toHaveBeenCalledWith("tender-1", "req-1");
    expect(refreshMock).toHaveBeenCalled();
  });

  it("displays the backend error when verifying a signatory's authority fails", async () => {
    verifySignatoryAction.mockResolvedValueOnce({ error: "Signataire introuvable." });
    const user = userEvent.setup();

    render(<SignatureSection tenderId="tender-1" initialRequirements={[]} initialSignatories={[signatory()]} initialTransactions={[]} finalExports={[]} actorRole="OWNER" />);
    await user.click(screen.getByRole("button", { name: "Vérifier le pouvoir" }));

    expect(verifySignatoryAction).toHaveBeenCalledWith("tender-1", "signatory-1", true);
    expect(await screen.findByRole("alert")).toHaveTextContent("Signataire introuvable.");
  });

  it("prepares a signature transaction only against a VERIFIED signatory and a FINAL export", async () => {
    prepareSignatureTransactionAction.mockResolvedValueOnce({ error: undefined });
    const user = userEvent.setup();

    render(
      <SignatureSection
        tenderId="tender-1"
        initialRequirements={[]}
        initialSignatories={[signatory({ status: "VERIFIED" })]}
        initialTransactions={[]}
        finalExports={[finalExport()]}
        actorRole="OWNER"
      />,
    );

    await user.click(screen.getByLabelText(/Alice Dupont/));
    await user.click(screen.getByRole("button", { name: "Préparer la transaction" }));

    expect(prepareSignatureTransactionAction).toHaveBeenCalledWith("tender-1", "export-final-1", ["signatory-1"]);
  });

  it("shows the FAKE demonstration banner and starts a transaction by calling startSignatureTransactionAction", async () => {
    startSignatureTransactionAction.mockResolvedValueOnce({ error: undefined });
    const user = userEvent.setup();

    render(<SignatureSection tenderId="tender-1" initialRequirements={[]} initialSignatories={[]} initialTransactions={[transaction()]} finalExports={[]} actorRole="OWNER" />);

    expect(screen.getByText(/Mode démonstration/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Démarrer" }));

    expect(startSignatureTransactionAction).toHaveBeenCalledWith("tender-1", "tx-1", expect.any(String));
  });

  it("synchronizes a SENT transaction (simulation locale) by calling syncSignatureTransactionAction", async () => {
    syncSignatureTransactionAction.mockResolvedValueOnce({ error: undefined });
    const user = userEvent.setup();

    render(<SignatureSection tenderId="tender-1" initialRequirements={[]} initialSignatories={[]} initialTransactions={[transaction({ status: "SENT" })]} finalExports={[]} actorRole="OWNER" />);
    await user.click(screen.getByRole("button", { name: "Synchroniser (simulation locale)" }));

    expect(syncSignatureTransactionAction).toHaveBeenCalledWith("tender-1", "tx-1");
  });
});
