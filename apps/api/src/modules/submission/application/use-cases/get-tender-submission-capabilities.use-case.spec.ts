import { describe, expect, it, vi } from "vitest";
import { GetTenderSubmissionCapabilitiesUseCase } from "./get-tender-submission-capabilities.use-case";
import { GetTenderSubmissionReadinessUseCase, SubmissionReadinessStatus, type TenderSubmissionReadinessResult } from "./get-tender-submission-readiness.use-case";
import { TenderSubmission } from "../../domain/tender-submission.aggregate";
import { SubmissionPlatform } from "../../domain/submission-platform";
import type { TenderSubmissionRepository } from "../ports/tender-submission.repository";
import type { SubmissionAccessService } from "../services/submission-access.service";
import type { AssertClientAccessUseCase } from "../../../client-portfolio";

const NOW = new Date("2026-09-10T10:00:00.000Z");
const ORGANIZATION_ID = "org-1";
const TENDER_ID = "tender-1";

function fakeAccessService(): SubmissionAccessService {
  return { assertTenderAccess: vi.fn(async () => ({ clientAccountId: "client-1" }) as never) } as unknown as SubmissionAccessService;
}
function fakeReadinessUseCase(result: Partial<TenderSubmissionReadinessResult> = {}): GetTenderSubmissionReadinessUseCase {
  const full: TenderSubmissionReadinessResult = {
    canSubmit: false,
    readinessStatus: SubmissionReadinessStatus.NotSubmitted,
    blockers: [],
    warnings: [],
    requiredActions: [],
    signatureRequirement: "SATISFIED_OR_NOT_REQUIRED",
    validationSummary: "APPROVED",
    ...result,
  };
  return { execute: vi.fn(async () => full) } as unknown as GetTenderSubmissionReadinessUseCase;
}
function fakeRepository(active: TenderSubmission | null = null): TenderSubmissionRepository {
  return { create: vi.fn(), findById: vi.fn(), findActiveForTender: vi.fn(async () => active), listByTender: vi.fn(), save: vi.fn(), replaceActive: vi.fn() };
}
function fakeAssertClientAccess(allowed: Set<string>): AssertClientAccessUseCase {
  return { execute: vi.fn(async ({ permission }: { permission: string }) => { if (!allowed.has(permission)) throw new Error("denied"); }) } as unknown as AssertClientAccessUseCase;
}
function inProgress() {
  return TenderSubmission.start({ id: "sub-1", organizationId: ORGANIZATION_ID, tenderId: TENDER_ID, packageId: "pkg-1", packageVersion: 1, packageHash: "a".repeat(64), startedByUserId: "user-1", platform: SubmissionPlatform.Place, occurredAt: NOW });
}
function submitted() {
  return TenderSubmission.record({ id: "sub-1", organizationId: ORGANIZATION_ID, tenderId: TENDER_ID, packageId: "pkg-1", packageVersion: 1, packageHash: "a".repeat(64), submittedByUserId: "user-1", submittedAt: NOW, platform: SubmissionPlatform.Place, occurredAt: NOW });
}

describe("GetTenderSubmissionCapabilitiesUseCase", () => {
  it("a full-rights actor can prepare when ready, and record once ready", async () => {
    const useCase = new GetTenderSubmissionCapabilitiesUseCase(
      fakeAccessService(),
      fakeAssertClientAccess(new Set(["CLIENT_MANAGE_SUBMISSION", "CLIENT_CONFIRM_SUBMISSION", "CLIENT_WITHDRAW_SUBMISSION"])),
      fakeReadinessUseCase({ readinessStatus: SubmissionReadinessStatus.ReadyForSubmission, canSubmit: true }),
      fakeRepository(),
    );
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });
    expect(result.canPrepareSubmission).toBe(true);
    expect(result.canRecordSubmission).toBe(true);
    expect(result.canUploadProof).toBe(false);
    expect(result.reasonsByAction.canUploadProof).toBeDefined();
  });

  it("a read-only actor (no manage/confirm/withdraw permission) can never mutate, with a precise reason each time", async () => {
    const useCase = new GetTenderSubmissionCapabilitiesUseCase(fakeAccessService(), fakeAssertClientAccess(new Set()), fakeReadinessUseCase({ readinessStatus: SubmissionReadinessStatus.ReadyForSubmission, canSubmit: true }), fakeRepository());
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "READ_ONLY", tenderId: TENDER_ID });
    expect(result.canViewSubmission).toBe(true);
    expect(result.canRecordSubmission).toBe(false);
    expect(result.canWithdrawSubmission).toBe(false);
    expect(result.reasonsByAction.canRecordSubmission).toBe("Vous n'avez pas l'autorisation nécessaire pour cette action.");
  });

  it("can upload a proof and confirm receipt once SUBMITTED, but cannot record a fresh submission", async () => {
    const useCase = new GetTenderSubmissionCapabilitiesUseCase(
      fakeAccessService(),
      fakeAssertClientAccess(new Set(["CLIENT_MANAGE_SUBMISSION", "CLIENT_CONFIRM_SUBMISSION", "CLIENT_WITHDRAW_SUBMISSION"])),
      fakeReadinessUseCase({ readinessStatus: SubmissionReadinessStatus.AlreadySubmitted, activeSubmissionId: "sub-1" }),
      fakeRepository(submitted()),
    );
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });
    expect(result.canUploadProof).toBe(true);
    expect(result.canConfirmReceipt).toBe(true);
    expect(result.canRecordRejection).toBe(true);
    expect(result.canReplaceSubmission).toBe(true);
    expect(result.canRecordSubmission).toBe(false);
    expect(result.availableActions).toContain("CONFIRM_RECEIPT");
  });

  it("can complete a SUBMISSION_IN_PROGRESS deposit but cannot yet confirm a receipt", async () => {
    const useCase = new GetTenderSubmissionCapabilitiesUseCase(
      fakeAccessService(),
      fakeAssertClientAccess(new Set(["CLIENT_MANAGE_SUBMISSION", "CLIENT_CONFIRM_SUBMISSION", "CLIENT_WITHDRAW_SUBMISSION"])),
      fakeReadinessUseCase({ readinessStatus: SubmissionReadinessStatus.SubmissionInProgress, activeSubmissionId: "sub-1" }),
      fakeRepository(inProgress()),
    );
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });
    expect(result.canRecordSubmission).toBe(true);
    expect(result.canCancelSubmission).toBe(true);
    expect(result.canConfirmReceipt).toBe(false);
  });
});
