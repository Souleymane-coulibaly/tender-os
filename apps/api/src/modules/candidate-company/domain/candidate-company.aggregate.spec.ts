import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CandidateCompany } from "./candidate-company.aggregate";
import { CandidateCompanyStatus } from "./candidate-company-status";
import { CandidateCompanyArchivedError } from "./errors";

const ORG = randomUUID();
const ACTOR = randomUUID();
const NOW = new Date("2026-08-17T10:00:00Z");

function createCompany(overrides: Partial<Parameters<typeof CandidateCompany.create>[0]> = {}) {
  return CandidateCompany.create({
    id: randomUUID(),
    organizationId: ORG,
    name: "Acme Travaux Publics",
    createdBy: ACTOR,
    occurredAt: NOW,
    ...overrides,
  });
}

describe("CandidateCompany", () => {
  it("is created ACTIVE by default, with a normalized name", () => {
    const company = createCompany({ name: "  Acme   Travaux  Publics  " });
    expect(company.status).toBe(CandidateCompanyStatus.Active);
    expect(company.name).toBe("  Acme   Travaux  Publics  ");
    expect(company.nameNormalized).toBe("acme travaux publics");
  });

  it("never accepts an initial ARCHIVED status — only create() -> archive() can reach it", () => {
    const company = createCompany();
    expect(company.status).toBe(CandidateCompanyStatus.Active);
  });

  it("keeps sourceClientAccountId as a plain migration-compatibility pointer, not a business identity", () => {
    const sourceId = randomUUID();
    const company = createCompany({ sourceClientAccountId: sourceId });
    expect(company.sourceClientAccountId).toBe(sourceId);
  });

  it("archives an ACTIVE company, setting archivedAt", () => {
    const company = createCompany();
    company.archive(NOW);
    expect(company.status).toBe(CandidateCompanyStatus.Archived);
    expect(company.archivedAt).toEqual(NOW);
  });

  it("archiving an already-archived company is idempotent (no-op, never throws)", () => {
    const company = createCompany();
    company.archive(NOW);
    const later = new Date(NOW.getTime() + 1000);
    expect(() => company.archive(later)).not.toThrow();
    expect(company.archivedAt).toEqual(NOW);
  });

  it("restores an archived company back to ACTIVE, clearing archivedAt", () => {
    const company = createCompany();
    company.archive(NOW);
    const later = new Date(NOW.getTime() + 1000);
    company.restore(later);
    expect(company.status).toBe(CandidateCompanyStatus.Active);
    expect(company.archivedAt).toBeUndefined();
  });

  it("restoring an already-active company is idempotent (no-op, never throws)", () => {
    const company = createCompany();
    expect(() => company.restore(NOW)).not.toThrow();
    expect(company.status).toBe(CandidateCompanyStatus.Active);
  });

  it("refuses to add an establishment to an archived company", () => {
    const company = createCompany();
    company.archive(NOW);
    expect(() => company.assertCanAddEstablishment()).toThrow(CandidateCompanyArchivedError);
  });

  it("allows adding an establishment to an active company", () => {
    const company = createCompany();
    expect(() => company.assertCanAddEstablishment()).not.toThrow();
  });
});
