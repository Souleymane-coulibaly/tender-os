import { describe, expect, it } from "vitest";
import { Signatory } from "./signatory";

const NOW = new Date("2026-09-01T10:00:00.000Z");

function baseInput(overrides: Partial<Parameters<typeof Signatory.create>[0]> = {}) {
  return {
    id: "sig-1",
    organizationId: "org-1",
    clientAccountId: "client-1",
    tenderId: "tender-1",
    firstName: "Jeanne",
    lastName: "Dupont",
    professionalEmail: "jeanne.dupont@example.com",
    createdBy: "user-1",
    occurredAt: NOW,
    ...overrides,
  };
}

describe("Signatory", () => {
  it("rejects an invalid professional email", () => {
    expect(() => Signatory.create(baseInput({ professionalEmail: "not-an-email" }))).toThrow();
  });

  it("rejects validFrom after validUntil", () => {
    expect(() =>
      Signatory.create(baseInput({ validFrom: new Date("2026-12-01"), validUntil: new Date("2026-01-01") })),
    ).toThrow();
  });

  it("a PENDING signatory fails assertVerified — never presumed authorized", () => {
    const signatory = Signatory.create(baseInput());
    expect(() => signatory.assertVerified(NOW)).toThrow();
  });

  it("a VERIFIED signatory within its validity window passes assertVerified", () => {
    const signatory = Signatory.create(baseInput());
    signatory.verify({ verifiedBy: "admin-1", occurredAt: NOW });
    expect(() => signatory.assertVerified(NOW)).not.toThrow();
  });

  it("a VERIFIED signatory outside its validity window still fails assertVerified", () => {
    const signatory = Signatory.create(baseInput({ validUntil: new Date("2026-01-01") }));
    signatory.verify({ verifiedBy: "admin-1", occurredAt: new Date("2025-12-01") });
    expect(() => signatory.assertVerified(NOW)).toThrow();
  });

  it("mission §42 — TenderOS OWNER/ADMIN role is never derived from userId: assertVerified depends only on explicit verify()", () => {
    const signatory = Signatory.create(baseInput({ userId: "owner-user-1" }));
    // Même si userId pointe vers un OWNER applicatif, aucun pouvoir n'est présumé.
    expect(() => signatory.assertVerified(NOW)).toThrow();
  });
});
