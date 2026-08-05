import { describe, expect, it } from "vitest";
import { SubmissionProof } from "./submission-proof.entity";
import { SubmissionProofType } from "./submission-proof-type";

describe("SubmissionProof.create", () => {
  it("links a proof to a submission and a verified document version", () => {
    const proof = SubmissionProof.create({
      id: "proof-1",
      submissionId: "sub-1",
      organizationId: "org-1",
      documentId: "doc-1",
      documentVersionId: "docver-1",
      proofType: SubmissionProofType.Receipt,
      hash: "a".repeat(64),
      uploadedByUserId: "user-1",
      occurredAt: new Date("2026-09-10T10:00:00.000Z"),
    });
    expect(proof.submissionId).toBe("sub-1");
    expect(proof.proofType).toBe(SubmissionProofType.Receipt);
    expect(proof.documentVersionId).toBe("docver-1");
  });
});
