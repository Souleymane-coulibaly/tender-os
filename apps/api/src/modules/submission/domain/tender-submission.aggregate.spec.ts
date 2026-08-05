import { describe, expect, it } from "vitest";
import { TenderSubmission } from "./tender-submission.aggregate";
import { InvalidTenderSubmissionStatusTransitionError } from "./errors";
import { SubmissionPlatform } from "./submission-platform";
import { SubmissionRejectionCategory } from "./submission-rejection-category";
import { TenderSubmissionStatus } from "./tender-submission-status";

const NOW = new Date("2026-09-10T10:00:00.000Z");
const ORGANIZATION_ID = "org-1";
const TENDER_ID = "tender-1";

function recordedSubmission(overrides: Partial<Parameters<typeof TenderSubmission.record>[0]> = {}) {
  return TenderSubmission.record({
    id: "sub-1",
    organizationId: ORGANIZATION_ID,
    tenderId: TENDER_ID,
    packageId: "pkg-1",
    packageVersion: 1,
    packageHash: "a".repeat(64),
    submittedByUserId: "user-1",
    submittedAt: NOW,
    platform: SubmissionPlatform.Place,
    occurredAt: NOW,
    ...overrides,
  });
}

describe("TenderSubmission.record", () => {
  it("is created directly as SUBMITTED, pinning the exact package reference", () => {
    const submission = recordedSubmission();
    expect(submission.status).toBe(TenderSubmissionStatus.Submitted);
    expect(submission.packageId).toBe("pkg-1");
    expect(submission.packageVersion).toBe(1);
    expect(submission.packageHash).toBe("a".repeat(64));
  });
});

describe("TenderSubmission.start / recordFromInProgress", () => {
  it("starts at SUBMISSION_IN_PROGRESS then completes to SUBMITTED", () => {
    const submission = TenderSubmission.start({
      id: "sub-2",
      organizationId: ORGANIZATION_ID,
      tenderId: TENDER_ID,
      packageId: "pkg-1",
      packageVersion: 1,
      packageHash: "a".repeat(64),
      startedByUserId: "user-1",
      platform: SubmissionPlatform.Place,
      occurredAt: NOW,
    });
    expect(submission.status).toBe(TenderSubmissionStatus.SubmissionInProgress);

    submission.recordFromInProgress({
      submittedByUserId: "user-1",
      submittedAt: NOW,
      platform: SubmissionPlatform.AwsAchat,
      platformReference: "REF-123",
      occurredAt: NOW,
    });
    expect(submission.status).toBe(TenderSubmissionStatus.Submitted);
    expect(submission.platform).toBe(SubmissionPlatform.AwsAchat);
    expect(submission.platformReference).toBe("REF-123");
  });
});

describe("TenderSubmission transitions", () => {
  it("confirms receipt from SUBMITTED", () => {
    const submission = recordedSubmission();
    submission.confirmReceipt({ receiptReference: "RECU-1", confirmedByUserId: "user-2", occurredAt: NOW });
    expect(submission.status).toBe(TenderSubmissionStatus.ReceiptConfirmed);
    expect(submission.receiptConfirmedByUserId).toBe("user-2");
    expect(submission.receiptReference).toBe("RECU-1");
  });

  it("rejects with a category and description", () => {
    const submission = recordedSubmission();
    submission.reject({ rejectionCategory: SubmissionRejectionCategory.InvalidFormat, rejectionDescription: "Format non accepté", occurredAt: NOW });
    expect(submission.status).toBe(TenderSubmissionStatus.SubmissionRejected);
    expect(submission.rejectionCategory).toBe(SubmissionRejectionCategory.InvalidFormat);
  });

  it("marks replaced, keeping its own package reference untouched", () => {
    const submission = recordedSubmission();
    submission.markReplaced({ replacedBySubmissionId: "sub-2", occurredAt: NOW });
    expect(submission.status).toBe(TenderSubmissionStatus.Replaced);
    expect(submission.replacedBySubmissionId).toBe("sub-2");
    expect(submission.packageId).toBe("pkg-1");
  });

  it("withdraws with a reason", () => {
    const submission = recordedSubmission();
    submission.withdraw({ withdrawnByUserId: "user-1", withdrawalReason: "Erreur de version", occurredAt: NOW });
    expect(submission.status).toBe(TenderSubmissionStatus.Withdrawn);
    expect(submission.withdrawalReason).toBe("Erreur de version");
  });

  it("cancels a SUBMISSION_IN_PROGRESS submission", () => {
    const submission = TenderSubmission.start({
      id: "sub-3",
      organizationId: ORGANIZATION_ID,
      tenderId: TENDER_ID,
      packageId: "pkg-1",
      packageVersion: 1,
      packageHash: "a".repeat(64),
      startedByUserId: "user-1",
      platform: SubmissionPlatform.Place,
      occurredAt: NOW,
    });
    submission.cancel({ cancelledByUserId: "user-1", cancellationReason: "Erreur de saisie", occurredAt: NOW });
    expect(submission.status).toBe(TenderSubmissionStatus.Cancelled);
  });

  it("refuses an invalid transition (rejecting an already-replaced submission)", () => {
    const submission = recordedSubmission();
    submission.markReplaced({ replacedBySubmissionId: "sub-2", occurredAt: NOW });
    expect(() => submission.reject({ rejectionCategory: SubmissionRejectionCategory.Other, rejectionDescription: "x", occurredAt: NOW })).toThrow(
      InvalidTenderSubmissionStatusTransitionError,
    );
  });

  it("refuses confirming receipt twice", () => {
    const submission = recordedSubmission();
    submission.confirmReceipt({ confirmedByUserId: "user-2", occurredAt: NOW });
    expect(() => submission.confirmReceipt({ confirmedByUserId: "user-2", occurredAt: NOW })).toThrow(InvalidTenderSubmissionStatusTransitionError);
  });
});
