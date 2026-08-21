import { describe, expect, it, vi } from "vitest";
import { WithdrawTenderSubmissionUseCase } from "./withdraw-tender-submission.use-case";
import { CancelTenderSubmissionUseCase } from "./cancel-tender-submission.use-case";
import { RecordSubmissionRejectionUseCase } from "./record-submission-rejection.use-case";
import { TenderSubmission } from "../../domain/tender-submission.aggregate";
import { TenderSubmissionNotFoundError } from "../../domain/errors";
import { SubmissionPlatform } from "../../domain/submission-platform";
import { SubmissionRejectionCategory } from "../../domain/submission-rejection-category";
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
function proofRepository(): SubmissionProofRepository {
  return { create: vi.fn(), findById: vi.fn(), listBySubmission: vi.fn(async () => []) };
}
function repositoryWith(submission: TenderSubmission | null): TenderSubmissionRepository {
  return { create: vi.fn(), findById: vi.fn(async () => submission), findActiveForTender: vi.fn(), listByTender: vi.fn(), save: vi.fn(async () => undefined), replaceActive: vi.fn(), listResponsePackageProvenance: vi.fn(async () => []) };
}
function submitted() {
  return TenderSubmission.record({ id: "sub-1", organizationId: ORGANIZATION_ID, tenderId: TENDER_ID, packageId: "pkg-1", packageVersion: 1, packageHash: "a".repeat(64), submittedByUserId: "user-1", submittedAt: NOW, platform: SubmissionPlatform.Place, occurredAt: NOW });
}
function inProgress() {
  return TenderSubmission.start({ id: "sub-1", organizationId: ORGANIZATION_ID, tenderId: TENDER_ID, packageId: "pkg-1", packageVersion: 1, packageHash: "a".repeat(64), startedByUserId: "user-1", platform: SubmissionPlatform.Place, occurredAt: NOW });
}

describe("WithdrawTenderSubmissionUseCase", () => {
  it("mission §15 — records the withdrawal with its reason, never deleting the submission", async () => {
    const submission = submitted();
    const useCase = new WithdrawTenderSubmissionUseCase(fakeAccessService(), repositoryWith(submission), proofRepository(), fakeAuditLogWriter(), { now: () => NOW });
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-2", actorRole: "OWNER", submissionId: "sub-1", withdrawalReason: "Erreur de version déposée" });
    expect(result.status).toBe(TenderSubmissionStatus.Withdrawn);
    expect(result.withdrawalReason).toBe("Erreur de version déposée");
  });

  it("throws NotFound for an unknown submission", async () => {
    const useCase = new WithdrawTenderSubmissionUseCase(fakeAccessService(), repositoryWith(null), proofRepository(), fakeAuditLogWriter(), { now: () => NOW });
    await expect(useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-2", actorRole: "OWNER", submissionId: "missing" })).rejects.toBeInstanceOf(TenderSubmissionNotFoundError);
  });
});

describe("CancelTenderSubmissionUseCase", () => {
  it("cancels a SUBMISSION_IN_PROGRESS deposit", async () => {
    const submission = inProgress();
    const useCase = new CancelTenderSubmissionUseCase(fakeAccessService(), repositoryWith(submission), fakeAuditLogWriter(), { now: () => NOW });
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-2", actorRole: "OWNER", submissionId: "sub-1", cancellationReason: "Saisie erronée" });
    expect(result.status).toBe(TenderSubmissionStatus.Cancelled);
  });
});

describe("RecordSubmissionRejectionUseCase", () => {
  it("mission §16 — records a technical rejection with its category and description", async () => {
    const submission = submitted();
    const useCase = new RecordSubmissionRejectionUseCase(fakeAccessService(), repositoryWith(submission), proofRepository(), fakeAuditLogWriter(), { now: () => NOW });
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-2", actorRole: "OWNER", submissionId: "sub-1", rejectionCategory: SubmissionRejectionCategory.SizeExceeded, rejectionDescription: "Fichier trop volumineux (>100 Mo)" });
    expect(result.status).toBe(TenderSubmissionStatus.SubmissionRejected);
    expect(result.rejectionCategory).toBe(SubmissionRejectionCategory.SizeExceeded);
  });
});
