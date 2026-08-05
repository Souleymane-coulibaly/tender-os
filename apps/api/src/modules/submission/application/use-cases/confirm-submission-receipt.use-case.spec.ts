import { describe, expect, it, vi } from "vitest";
import { ConfirmSubmissionReceiptUseCase } from "./confirm-submission-receipt.use-case";
import { SubmissionProof } from "../../domain/submission-proof.entity";
import { TenderSubmission } from "../../domain/tender-submission.aggregate";
import { ReceiptConfirmationRequiresEvidenceError, TenderSubmissionNotFoundError } from "../../domain/errors";
import { SubmissionPlatform } from "../../domain/submission-platform";
import { SubmissionProofType } from "../../domain/submission-proof-type";
import { TenderSubmissionStatus } from "../../domain/tender-submission-status";
import type { AuditLogWriter } from "../ports/audit-log-writer";
import type { SubmissionProofRepository } from "../ports/submission-proof.repository";
import type { TenderSubmissionRepository } from "../ports/tender-submission.repository";
import type { SubmissionAccessService } from "../services/submission-access.service";

const NOW = new Date("2026-09-10T10:00:00.000Z");
const ORGANIZATION_ID = "org-1";
const TENDER_ID = "tender-1";

function fakeAccessService(): SubmissionAccessService {
  return { assertTenderAccess: vi.fn(async () => ({ clientAccountId: "client-1" }) as never) } as unknown as SubmissionAccessService;
}
function fakeAuditLogWriter(): AuditLogWriter {
  return { record: vi.fn(async () => undefined) };
}
function submitted() {
  return TenderSubmission.record({ id: "sub-1", organizationId: ORGANIZATION_ID, tenderId: TENDER_ID, packageId: "pkg-1", packageVersion: 1, packageHash: "a".repeat(64), submittedByUserId: "user-1", submittedAt: NOW, platform: SubmissionPlatform.Place, occurredAt: NOW });
}
function repositoryWith(submission: TenderSubmission | null): TenderSubmissionRepository {
  return { create: vi.fn(), findById: vi.fn(async () => submission), findActiveForTender: vi.fn(), listByTender: vi.fn(), save: vi.fn(async () => undefined), replaceActive: vi.fn() };
}
function proofRepository(proofs: readonly SubmissionProof[] = []): SubmissionProofRepository {
  return { create: vi.fn(), findById: vi.fn(), listBySubmission: vi.fn(async () => proofs) };
}

describe("ConfirmSubmissionReceiptUseCase", () => {
  it("throws NotFound for an unknown submission", async () => {
    const useCase = new ConfirmSubmissionReceiptUseCase(fakeAccessService(), repositoryWith(null), proofRepository(), fakeAuditLogWriter(), { now: () => NOW });
    await expect(useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", submissionId: "missing" })).rejects.toBeInstanceOf(TenderSubmissionNotFoundError);
  });

  it("mission §13 — refuses to confirm without a receipt reference, a proof, or an explicit human confirmation", async () => {
    const useCase = new ConfirmSubmissionReceiptUseCase(fakeAccessService(), repositoryWith(submitted()), proofRepository([]), fakeAuditLogWriter(), { now: () => NOW });
    await expect(useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", submissionId: "sub-1" })).rejects.toBeInstanceOf(ReceiptConfirmationRequiresEvidenceError);
  });

  it("confirms when a receiptReference is supplied", async () => {
    const submission = submitted();
    const useCase = new ConfirmSubmissionReceiptUseCase(fakeAccessService(), repositoryWith(submission), proofRepository([]), fakeAuditLogWriter(), { now: () => NOW });
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-2", actorRole: "OWNER", submissionId: "sub-1", receiptReference: "RECU-1" });
    expect(result.status).toBe(TenderSubmissionStatus.ReceiptConfirmed);
    expect(result.receiptReference).toBe("RECU-1");
  });

  it("confirms when a proof already exists, without requiring a receiptReference", async () => {
    const proof = SubmissionProof.create({ id: "proof-1", submissionId: "sub-1", organizationId: ORGANIZATION_ID, documentId: "doc-1", documentVersionId: "docver-1", proofType: SubmissionProofType.Receipt, hash: "a".repeat(64), uploadedByUserId: "user-1", occurredAt: NOW });
    const useCase = new ConfirmSubmissionReceiptUseCase(fakeAccessService(), repositoryWith(submitted()), proofRepository([proof]), fakeAuditLogWriter(), { now: () => NOW });
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-2", actorRole: "OWNER", submissionId: "sub-1" });
    expect(result.status).toBe(TenderSubmissionStatus.ReceiptConfirmed);
  });

  it("confirms with an explicit human confirmation even without any evidence", async () => {
    const useCase = new ConfirmSubmissionReceiptUseCase(fakeAccessService(), repositoryWith(submitted()), proofRepository([]), fakeAuditLogWriter(), { now: () => NOW });
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-2", actorRole: "OWNER", submissionId: "sub-1", confirmedWithoutEvidence: true });
    expect(result.status).toBe(TenderSubmissionStatus.ReceiptConfirmed);
  });
});
