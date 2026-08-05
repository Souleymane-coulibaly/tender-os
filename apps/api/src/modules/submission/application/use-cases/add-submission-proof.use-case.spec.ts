import { describe, expect, it, vi } from "vitest";
import { AddSubmissionProofUseCase } from "./add-submission-proof.use-case";
import { TenderSubmission } from "../../domain/tender-submission.aggregate";
import { TenderSubmissionNotFoundError } from "../../domain/errors";
import { SubmissionPlatform } from "../../domain/submission-platform";
import { SubmissionProofType } from "../../domain/submission-proof-type";
import { DomainError } from "../../../../shared-kernel/domain-error";
import type { AuditLogWriter } from "../ports/audit-log-writer";
import type { SubmissionProofRepository } from "../ports/submission-proof.repository";
import type { TenderSubmissionRepository } from "../ports/tender-submission.repository";
import type { SubmissionAccessService } from "../services/submission-access.service";
import type { AttachDocumentToTenderUseCase, GetDocumentUseCase } from "../../../documents";

/** Même shape que `DuplicateDocumentTenderAssociationError` (module Documents, non exporté
 *  publiquement) — reproduit ici uniquement pour le test, sans import profond inter-module. */
class FakeDuplicateDocumentTenderAssociationError extends DomainError {
  readonly code = "DUPLICATE_DOCUMENT_TENDER_ASSOCIATION";
  constructor() {
    super("This document is already associated with this tender.");
  }
}

const NOW = new Date("2026-09-10T10:00:00.000Z");
const ORGANIZATION_ID = "org-1";
const TENDER_ID = "tender-1";
const OTHER_TENDER_ID = "tender-2";

function fakeAccessService(): SubmissionAccessService {
  return { assertTenderAccess: vi.fn(async () => ({ clientAccountId: "client-1" }) as never) } as unknown as SubmissionAccessService;
}
function fakeAuditLogWriter(): AuditLogWriter {
  return { record: vi.fn(async () => undefined) };
}
function fakeGetDocumentUseCase(): GetDocumentUseCase {
  return { execute: vi.fn(async () => ({ id: "doc-1", currentVersion: { id: "docver-1", checksum: "a".repeat(64), sanitizedFilename: "recu.pdf", mimeType: "application/pdf" } }) as never) } as unknown as GetDocumentUseCase;
}
function submitted() {
  return TenderSubmission.record({ id: "sub-1", organizationId: ORGANIZATION_ID, tenderId: TENDER_ID, packageId: "pkg-1", packageVersion: 1, packageHash: "a".repeat(64), submittedByUserId: "user-1", submittedAt: NOW, platform: SubmissionPlatform.Place, occurredAt: NOW });
}
function repositoryWith(submission: TenderSubmission | null): TenderSubmissionRepository {
  return { create: vi.fn(), findById: vi.fn(async () => submission), findActiveForTender: vi.fn(), listByTender: vi.fn(), save: vi.fn(), replaceActive: vi.fn() };
}
function proofRepository(): SubmissionProofRepository {
  return { create: vi.fn(async () => undefined), findById: vi.fn(), listBySubmission: vi.fn(async () => []) };
}

describe("AddSubmissionProofUseCase", () => {
  it("throws NotFound for an unknown submission", async () => {
    const useCase = new AddSubmissionProofUseCase(fakeAccessService(), fakeGetDocumentUseCase(), { execute: vi.fn() } as unknown as AttachDocumentToTenderUseCase, repositoryWith(null), proofRepository(), fakeAuditLogWriter(), { now: () => NOW }, { generate: () => "proof-1" });
    await expect(useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", submissionId: "missing", documentId: "doc-1", proofType: SubmissionProofType.Receipt })).rejects.toBeInstanceOf(TenderSubmissionNotFoundError);
  });

  it("mission §12/§30 (correctif audit Codex P1) — attaches the proof document to the submission's OWN Tender, never trusting a document merely accessible to the actor", async () => {
    const attachDocumentToTenderUseCase = { execute: vi.fn(async () => undefined) } as unknown as AttachDocumentToTenderUseCase;
    const useCase = new AddSubmissionProofUseCase(fakeAccessService(), fakeGetDocumentUseCase(), attachDocumentToTenderUseCase, repositoryWith(submitted()), proofRepository(), fakeAuditLogWriter(), { now: () => NOW }, { generate: () => "proof-1" });

    await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", submissionId: "sub-1", documentId: "doc-1", proofType: SubmissionProofType.Receipt });

    expect(attachDocumentToTenderUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({ documentId: "doc-1", tenderId: TENDER_ID }));
    expect(attachDocumentToTenderUseCase.execute).not.toHaveBeenCalledWith(expect.objectContaining({ tenderId: OTHER_TENDER_ID }));
  });

  it("tolerates the document already being associated with this Tender (idempotent, never a failure)", async () => {
    const attachDocumentToTenderUseCase = {
      execute: vi.fn(async () => {
        throw new FakeDuplicateDocumentTenderAssociationError();
      }),
    } as unknown as AttachDocumentToTenderUseCase;
    const proofRepo = proofRepository();
    const useCase = new AddSubmissionProofUseCase(fakeAccessService(), fakeGetDocumentUseCase(), attachDocumentToTenderUseCase, repositoryWith(submitted()), proofRepo, fakeAuditLogWriter(), { now: () => NOW }, { generate: () => "proof-1" });

    await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", submissionId: "sub-1", documentId: "doc-1", proofType: SubmissionProofType.Receipt });

    expect(proofRepo.create).toHaveBeenCalledOnce();
  });

  it("propagates any OTHER failure from the tender-attachment step, never silently swallowed", async () => {
    const unrelatedError = new Error("boom");
    const attachDocumentToTenderUseCase = { execute: vi.fn(async () => { throw unrelatedError; }) } as unknown as AttachDocumentToTenderUseCase;
    const useCase = new AddSubmissionProofUseCase(fakeAccessService(), fakeGetDocumentUseCase(), attachDocumentToTenderUseCase, repositoryWith(submitted()), proofRepository(), fakeAuditLogWriter(), { now: () => NOW }, { generate: () => "proof-1" });

    await expect(useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", submissionId: "sub-1", documentId: "doc-1", proofType: SubmissionProofType.Receipt })).rejects.toBe(unrelatedError);
  });
});
