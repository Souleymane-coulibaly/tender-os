import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { TenderSubmission } from "../domain/tender-submission.aggregate";
import { SubmissionPlatform } from "../domain/submission-platform";
import { PrismaTenderSubmissionRepository } from "./prisma-tender-submission.repository";

/**
 * Checkpoint TENDEROS-2.1-P2.2-F2.3.1, mission §23-26 — preuve PostgreSQL RÉELLE que
 * `TenderSubmission` + `SubmissionResponsePackage[]` sont écrits dans UNE SEULE transaction : une
 * écriture forcée à échouer à mi-chemin (deux lignes de provenance portant le MÊME `lotId`, ce qui
 * viole la contrainte unique réelle `@@unique([submissionId, lotId])`, jamais affaiblie pour ce
 * test, mission §26) ne doit laisser NI Submission NI provenance orpheline persistée.
 */
describe("PrismaTenderSubmissionRepository — atomicité Submission + SubmissionResponsePackage[] (PostgreSQL réel)", () => {
  const prisma = new PrismaService();
  const repository = new PrismaTenderSubmissionRepository(prisma);

  const organizationId = randomUUID();
  const clientAccountId = randomUUID();
  const tenderId = randomUUID();

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.create({ data: { id: organizationId, name: "F2.3.1 Atomic Test Org", slug: `f231-atomic-test-org-${organizationId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" } });
    await prisma.clientAccount.create({ data: { id: clientAccountId, organizationId, name: "Client", nameNormalized: "client", status: "ACTIVE", createdBy: randomUUID() } });
    await prisma.tender.create({ data: { id: tenderId, organizationId, clientAccountId, title: "Marché atomicité F2.3.1", status: "DRAFT", tags: [], createdBy: randomUUID() } });
  });

  afterAll(async () => {
    await prisma.submissionResponsePackage.deleteMany({ where: { organizationId } });
    await prisma.tenderSubmission.deleteMany({ where: { organizationId } });
    await prisma.tender.deleteMany({ where: { organizationId } });
    await prisma.clientAccount.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  it("mission §24/§25 — a duplicate-lotId provenance batch (real unique constraint violation) rolls back the whole transaction: neither the Submission nor any provenance row survives", async () => {
    const submissionId = randomUUID();
    const submission = TenderSubmission.record({
      id: submissionId,
      organizationId,
      tenderId,
      packageId: randomUUID(),
      packageVersion: 1,
      packageHash: "a".repeat(64),
      submittedByUserId: randomUUID(),
      submittedAt: new Date(),
      platform: SubmissionPlatform.Place,
      occurredAt: new Date(),
    });

    // Deux entrées portant le MÊME lotId — violation RÉELLE de `@@unique([submissionId, lotId])`
    // au sein du même `createMany`, jamais une contrainte affaiblie pour faire passer ce test.
    const duplicateLotId = randomUUID();
    const provenance = [
      { lotId: duplicateLotId, responsePackageVersionId: randomUUID(), responsePackageArtifactId: randomUUID(), artifactChecksum: "b".repeat(64) },
      { lotId: duplicateLotId, responsePackageVersionId: randomUUID(), responsePackageArtifactId: randomUUID(), artifactChecksum: "c".repeat(64) },
    ];

    await expect(repository.create(submission, provenance)).rejects.toThrow();

    const persistedSubmission = await repository.findById({ organizationId, submissionId });
    expect(persistedSubmission).toBeNull();

    const persistedProvenance = await repository.listResponsePackageProvenance({ organizationId, submissionId });
    expect(persistedProvenance).toEqual([]);
  });
});
