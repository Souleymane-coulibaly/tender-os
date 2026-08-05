import { describe, expect, it } from "vitest";
import { canTransitionTenderSubmissionStatus, isInFlightTenderSubmissionStatus, TenderSubmissionStatus } from "./tender-submission-status";

describe("canTransitionTenderSubmissionStatus", () => {
  it("allows the mission §7 golden path", () => {
    expect(canTransitionTenderSubmissionStatus(TenderSubmissionStatus.SubmissionInProgress, TenderSubmissionStatus.Submitted)).toBe(true);
    expect(canTransitionTenderSubmissionStatus(TenderSubmissionStatus.Submitted, TenderSubmissionStatus.ReceiptConfirmed)).toBe(true);
    expect(canTransitionTenderSubmissionStatus(TenderSubmissionStatus.Submitted, TenderSubmissionStatus.SubmissionRejected)).toBe(true);
    expect(canTransitionTenderSubmissionStatus(TenderSubmissionStatus.Submitted, TenderSubmissionStatus.Replaced)).toBe(true);
    expect(canTransitionTenderSubmissionStatus(TenderSubmissionStatus.Submitted, TenderSubmissionStatus.Withdrawn)).toBe(true);
    expect(canTransitionTenderSubmissionStatus(TenderSubmissionStatus.ReceiptConfirmed, TenderSubmissionStatus.Replaced)).toBe(true);
    expect(canTransitionTenderSubmissionStatus(TenderSubmissionStatus.ReceiptConfirmed, TenderSubmissionStatus.Withdrawn)).toBe(true);
  });

  it("refuses transitions out of a terminal status", () => {
    expect(canTransitionTenderSubmissionStatus(TenderSubmissionStatus.Replaced, TenderSubmissionStatus.Submitted)).toBe(false);
    expect(canTransitionTenderSubmissionStatus(TenderSubmissionStatus.Withdrawn, TenderSubmissionStatus.Submitted)).toBe(false);
    expect(canTransitionTenderSubmissionStatus(TenderSubmissionStatus.Cancelled, TenderSubmissionStatus.Submitted)).toBe(false);
    expect(canTransitionTenderSubmissionStatus(TenderSubmissionStatus.SubmissionRejected, TenderSubmissionStatus.Submitted)).toBe(false);
  });

  it("refuses skipping straight from SUBMISSION_IN_PROGRESS to RECEIPT_CONFIRMED", () => {
    expect(canTransitionTenderSubmissionStatus(TenderSubmissionStatus.SubmissionInProgress, TenderSubmissionStatus.ReceiptConfirmed)).toBe(false);
  });

  it("refuses an already-VALIDATED-equivalent (RECEIPT_CONFIRMED) going back to SUBMISSION_REJECTED", () => {
    expect(canTransitionTenderSubmissionStatus(TenderSubmissionStatus.ReceiptConfirmed, TenderSubmissionStatus.SubmissionRejected)).toBe(false);
  });

  it("refuses rejecting an already-FAILED (SUBMISSION_REJECTED) submission again", () => {
    expect(canTransitionTenderSubmissionStatus(TenderSubmissionStatus.SubmissionRejected, TenderSubmissionStatus.SubmissionRejected)).toBe(false);
  });
});

describe("isInFlightTenderSubmissionStatus", () => {
  it("treats SUBMISSION_IN_PROGRESS/SUBMITTED/RECEIPT_CONFIRMED as in-flight", () => {
    expect(isInFlightTenderSubmissionStatus(TenderSubmissionStatus.SubmissionInProgress)).toBe(true);
    expect(isInFlightTenderSubmissionStatus(TenderSubmissionStatus.Submitted)).toBe(true);
    expect(isInFlightTenderSubmissionStatus(TenderSubmissionStatus.ReceiptConfirmed)).toBe(true);
  });

  it("treats terminal statuses as not in-flight", () => {
    expect(isInFlightTenderSubmissionStatus(TenderSubmissionStatus.Replaced)).toBe(false);
    expect(isInFlightTenderSubmissionStatus(TenderSubmissionStatus.Withdrawn)).toBe(false);
    expect(isInFlightTenderSubmissionStatus(TenderSubmissionStatus.Cancelled)).toBe(false);
    expect(isInFlightTenderSubmissionStatus(TenderSubmissionStatus.SubmissionRejected)).toBe(false);
  });
});
