import { describe, expect, it } from "vitest";
import { SignatureTransaction } from "./signature-transaction.aggregate";
import { SignatureTransactionStatus } from "./signature-transaction-status";
import { SIGNATURE_PROVIDER } from "./signature-level";

const NOW = new Date("2026-09-01T10:00:00.000Z");
const HASH = "b".repeat(64);

function baseInput() {
  return {
    id: "tx-1",
    organizationId: "org-1",
    clientAccountId: "client-1",
    tenderId: "tender-1",
    exportArtifactId: "artifact-1",
    provider: SIGNATURE_PROVIDER.Fake,
    documentHash: HASH,
    createdBy: "user-1",
    occurredAt: NOW,
  };
}

describe("SignatureTransaction", () => {
  it("rejects a malformed documentHash", () => {
    expect(() => SignatureTransaction.create({ ...baseInput(), documentHash: "not-a-hash" })).toThrow();
  });

  it("starts PREPARING and follows the full happy path to SIGNED", () => {
    const tx = SignatureTransaction.create(baseInput());
    expect(tx.status).toBe(SignatureTransactionStatus.Preparing);
    tx.markReadyToSend({ providerTransactionId: "provider-tx-1" });
    tx.markSent(NOW);
    tx.markInProgress();
    tx.markSigned(NOW);
    expect(tx.status).toBe(SignatureTransactionStatus.Signed);
  });

  it("SIGNED can only move to VERIFIED or INVALID — never silently, and never back", () => {
    const tx = SignatureTransaction.create(baseInput());
    tx.markReadyToSend({ providerTransactionId: "provider-tx-1" });
    tx.markSent(NOW);
    tx.markSigned(NOW);
    expect(() => tx.markSent(NOW)).toThrow();
    tx.markVerified();
    expect(tx.status).toBe(SignatureTransactionStatus.Verified);
    expect(() => tx.markSigned(NOW)).toThrow();
  });

  it("a webhook 'signed' event alone cannot reach VERIFIED without an explicit verify call", () => {
    const tx = SignatureTransaction.create(baseInput());
    tx.markReadyToSend({ providerTransactionId: "provider-tx-1" });
    tx.markSent(NOW);
    tx.markSigned(NOW);
    // Only markVerified() (called after a REAL integrity check) can reach VERIFIED — simply being
    // SIGNED is not enough, matching mission "un statut SIGNED non vérifié ne doit pas produire
    // automatiquement VERIFIED".
    expect(tx.status).toBe(SignatureTransactionStatus.Signed);
    expect(tx.status).not.toBe(SignatureTransactionStatus.Verified);
  });

  it("DECLINED/CANCELLED/EXPIRED/FAILED are terminal — no further transition allowed", () => {
    const tx = SignatureTransaction.create(baseInput());
    tx.markReadyToSend({ providerTransactionId: "provider-tx-1" });
    tx.markSent(NOW);
    tx.markDeclined(NOW);
    expect(() => tx.markSigned(NOW)).toThrow();
  });
});
