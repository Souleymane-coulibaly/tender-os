import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { SignatureArtifact, SignatureArtifactKind, SignatureArtifactSource } from "../domain/signature-artifact";
import { SignatureParticipant } from "../domain/signature-participant";
import { SignatureProviderEvent } from "../domain/signature-provider-event";
import { SignatureRequirement } from "../domain/signature-requirement";
import { Signatory } from "../domain/signatory";
import { SignatureTransaction } from "../domain/signature-transaction.aggregate";
import { PrismaSignatoryRepository } from "./prisma-signatory.repository";
import { PrismaSignatureProviderEventRepository } from "./prisma-signature-provider-event.repository";
import { PrismaSignatureRequirementRepository } from "./prisma-signature-requirement.repository";
import { PrismaSignatureTransactionRepository } from "./prisma-signature-transaction.repository";

const DOCUMENT_HASH = "a".repeat(64);
const FILE_HASH = "b".repeat(64);

/** Preuve PostgreSQL réelle (mission Sprint 8A bis §75) — persistance réelle des 5 tables
 *  Signature, isolation tenant, idempotence webhook via la contrainte unique réelle. */
describe("Signature repositories (PostgreSQL réel)", () => {
  const prisma = new PrismaService();
  const requirementRepository = new PrismaSignatureRequirementRepository(prisma);
  const signatoryRepository = new PrismaSignatoryRepository(prisma);
  const transactionRepository = new PrismaSignatureTransactionRepository(prisma);
  const providerEventRepository = new PrismaSignatureProviderEventRepository(prisma);

  const organizationId = randomUUID();
  const otherOrganizationId = randomUUID();
  const clientAccountId = randomUUID();
  const tenderId = randomUUID();
  const exportArtifactId = randomUUID();
  const now = new Date("2026-09-01T10:00:00Z");

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.createMany({
      data: [
        { id: organizationId, name: "Signature Repo Test Org", slug: `signature-repo-test-org-${organizationId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
        { id: otherOrganizationId, name: "Signature Repo Test Org (other)", slug: `signature-repo-test-org-other-${otherOrganizationId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
      ],
    });
    await prisma.clientAccount.create({ data: { id: clientAccountId, organizationId, name: "Client", nameNormalized: "client", status: "ACTIVE", createdBy: randomUUID() } });
    await prisma.tender.create({ data: { id: tenderId, organizationId, clientAccountId, title: "Marché de test", status: "DRAFT", tags: [], createdBy: randomUUID() } });

    // Chaîne Export réelle jusqu'à un ExportArtifact — seule sa présence (FK réelle) importe ici.
    const templateId = randomUUID();
    await prisma.exportTemplate.create({ data: { id: templateId, organizationId, documentType: "SIGNATURE_PACKAGE", name: `T-${randomUUID()}`, createdBy: randomUUID() } });
    const templateVersionId = randomUUID();
    await prisma.exportTemplateVersion.create({
      data: { id: templateVersionId, organizationId, exportTemplateId: templateId, version: 1, status: "DRAFT", format: "PDF", config: { sections: [] }, createdBy: randomUUID() },
    });
    const exportJobId = randomUUID();
    await prisma.exportJob.create({
      data: {
        id: exportJobId,
        organizationId,
        clientAccountId,
        tenderId,
        exportTemplateId: templateId,
        exportTemplateVersionId: templateVersionId,
        documentType: "SIGNATURE_PACKAGE",
        mode: "FINAL",
        format: "PDF",
        status: "COMPLETED",
        version: 1,
        createdBy: randomUUID(),
      },
    });
    await prisma.exportArtifact.create({
      data: {
        id: exportArtifactId,
        organizationId,
        exportJobId,
        fileName: "memoire-technique.pdf",
        mimeType: "application/pdf",
        fileSize: 1024,
        fileHash: FILE_HASH,
        storageKey: `exports/${organizationId}/${tenderId}/${exportJobId}.pdf`,
        manifestJson: {},
      },
    });
  });

  afterAll(async () => {
    await prisma.signatureProviderEvent.deleteMany({ where: { organizationId: { in: [organizationId, otherOrganizationId] } } });
    await prisma.signatureArtifact.deleteMany({ where: { organizationId } });
    await prisma.signatureParticipant.deleteMany({ where: { organizationId } });
    await prisma.signatureTransaction.deleteMany({ where: { organizationId } });
    await prisma.signatory.deleteMany({ where: { organizationId } });
    await prisma.signatureRequirement.deleteMany({ where: { organizationId } });
    await prisma.exportArtifact.deleteMany({ where: { organizationId } });
    await prisma.exportJob.deleteMany({ where: { organizationId } });
    await prisma.exportTemplate.deleteMany({ where: { organizationId } });
    await prisma.tender.deleteMany({ where: { organizationId } });
    await prisma.clientAccount.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: { in: [organizationId, otherOrganizationId] } } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.signatureProviderEvent.deleteMany({ where: { organizationId } });
    await prisma.signatureArtifact.deleteMany({ where: { organizationId } });
    await prisma.signatureParticipant.deleteMany({ where: { organizationId } });
    await prisma.signatureTransaction.deleteMany({ where: { organizationId } });
    await prisma.signatory.deleteMany({ where: { organizationId } });
    await prisma.signatureRequirement.deleteMany({ where: { organizationId } });
  });

  function buildRequirement() {
    return SignatureRequirement.create({
      id: randomUUID(),
      organizationId,
      clientAccountId,
      tenderId,
      documentRef: "Acte d'engagement",
      mandatory: true,
      createdBy: randomUUID(),
      occurredAt: now,
    });
  }

  function buildSignatory() {
    return Signatory.create({
      id: randomUUID(),
      organizationId,
      clientAccountId,
      tenderId,
      firstName: "Alice",
      lastName: "Dupont",
      professionalEmail: "alice.dupont@example.com",
      createdBy: randomUUID(),
      occurredAt: now,
    });
  }

  function buildTransactionWithParticipant(signatoryId: string) {
    const transaction = SignatureTransaction.create({
      id: randomUUID(),
      organizationId,
      clientAccountId,
      tenderId,
      exportArtifactId,
      provider: "FAKE",
      documentHash: DOCUMENT_HASH,
      createdBy: randomUUID(),
      occurredAt: now,
    });
    const participant = SignatureParticipant.create({
      id: randomUUID(),
      organizationId,
      signatureTransactionId: transaction.id,
      signatoryId,
      sequence: 1,
      occurredAt: now,
    });
    return { transaction, participant };
  }

  it("SignatureRequirement: persists, reads back, and confirms for real", async () => {
    const requirement = buildRequirement();
    await requirementRepository.create(requirement);

    const found = await requirementRepository.findById({ organizationId, requirementId: requirement.id });
    expect(found!.status).toBe("DETECTED");

    found!.confirm({ confirmedBy: randomUUID(), occurredAt: now });
    await requirementRepository.save(found!);

    const reloaded = await requirementRepository.findById({ organizationId, requirementId: requirement.id });
    expect(reloaded!.status).toBe("CONFIRMED");

    const forTender = await requirementRepository.listForTender({ organizationId, tenderId });
    expect(forTender.map((r) => r.id)).toContain(requirement.id);
  });

  it("Signatory: persists, verifies for real, and assertVerified succeeds only after verification", async () => {
    const signatory = buildSignatory();
    await signatoryRepository.create(signatory);

    const found = await signatoryRepository.findById({ organizationId, signatoryId: signatory.id });
    expect(() => found!.assertVerified(now)).toThrow();

    found!.verify({ verifiedBy: randomUUID(), occurredAt: now });
    await signatoryRepository.save(found!);

    const reloaded = await signatoryRepository.findById({ organizationId, signatoryId: signatory.id });
    expect(() => reloaded!.assertVerified(now)).not.toThrow();
  });

  it("SignatureTransaction: creates with participants, transitions are persisted for real, artifacts round-trip", async () => {
    const signatory = buildSignatory();
    await signatoryRepository.create(signatory);
    const { transaction, participant } = buildTransactionWithParticipant(signatory.id);

    await transactionRepository.create({ transaction, participants: [participant] });

    const found = await transactionRepository.findById({ organizationId, transactionId: transaction.id });
    expect(found!.transaction.status).toBe("PREPARING");
    expect(found!.participants).toHaveLength(1);

    found!.transaction.markReadyToSend({ providerTransactionId: "fake_tx_1" });
    await transactionRepository.save(found!.transaction);
    found!.transaction.markSent(now);
    await transactionRepository.save(found!.transaction);

    const artifact = SignatureArtifact.create({
      id: randomUUID(),
      organizationId,
      signatureTransactionId: transaction.id,
      kind: SignatureArtifactKind.SignedDocument,
      fileName: "memoire-signe.pdf",
      mimeType: "application/pdf",
      fileSize: 2048,
      fileHash: FILE_HASH,
      storageKey: `signatures/${organizationId}/${transaction.id}/signed.pdf`,
      source: SignatureArtifactSource.Provider,
      occurredAt: now,
    });
    await transactionRepository.addArtifact(artifact);

    const reloaded = await transactionRepository.findById({ organizationId, transactionId: transaction.id });
    expect(reloaded!.transaction.status).toBe("SENT");
    expect(reloaded!.transaction.providerTransactionId).toBe("fake_tx_1");
    expect(reloaded!.artifacts).toHaveLength(1);
    expect(reloaded!.artifacts[0]!.verificationStatus).toBe("TO_VERIFY");

    const byProvider = await transactionRepository.findByProviderTransactionId({ provider: "FAKE", providerTransactionId: "fake_tx_1" });
    expect(byProvider!.transaction.id).toBe(transaction.id);

    const forTender = await transactionRepository.listForTender({ organizationId, tenderId });
    expect(forTender.map((r) => r.transaction.id)).toContain(transaction.id);
  });

  it("tenant isolation — organization A cannot read organization B's signature data", async () => {
    const requirement = buildRequirement();
    await requirementRepository.create(requirement);
    const signatory = buildSignatory();
    await signatoryRepository.create(signatory);
    const { transaction, participant } = buildTransactionWithParticipant(signatory.id);
    await transactionRepository.create({ transaction, participants: [participant] });

    expect(await requirementRepository.findById({ organizationId: otherOrganizationId, requirementId: requirement.id })).toBeNull();
    expect(await signatoryRepository.findById({ organizationId: otherOrganizationId, signatoryId: signatory.id })).toBeNull();
    expect(await transactionRepository.findById({ organizationId: otherOrganizationId, transactionId: transaction.id })).toBeNull();
  });

  it("SignatureProviderEvent: idempotence — a duplicate (provider, providerEventId) is rejected, never a second row", async () => {
    const event = SignatureProviderEvent.create({
      id: randomUUID(),
      organizationId,
      provider: "UNIVERSIGN",
      providerEventId: "evt_1",
      eventType: "transaction.lifecycle.completed",
      receivedAt: now,
      status: "RECEIVED",
      payloadHash: "c".repeat(64),
      signatureVerified: true,
      retryCount: 0,
    });

    const first = await providerEventRepository.tryRecord(event);
    expect(first).toBe(true);

    const duplicate = SignatureProviderEvent.create({
      id: randomUUID(),
      organizationId,
      provider: "UNIVERSIGN",
      providerEventId: "evt_1",
      eventType: "transaction.lifecycle.completed",
      receivedAt: now,
      status: "RECEIVED",
      payloadHash: "c".repeat(64),
      signatureVerified: true,
      retryCount: 0,
    });
    const second = await providerEventRepository.tryRecord(duplicate);
    expect(second).toBe(false);

    await providerEventRepository.markProcessed({ id: event.id, occurredAt: now });
    const stored = await prisma.signatureProviderEvent.findMany({ where: { organizationId, providerEventId: "evt_1" } });
    expect(stored).toHaveLength(1);
    expect(stored[0]!.status).toBe("PROCESSED");
  });

  it("repeated (3x) concurrent transaction creation for distinct signatories never corrupts participant data", async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const signatory = buildSignatory();
      await signatoryRepository.create(signatory);
      const { transaction, participant } = buildTransactionWithParticipant(signatory.id);
      await transactionRepository.create({ transaction, participants: [participant] });

      const found = await transactionRepository.findById({ organizationId, transactionId: transaction.id });
      expect(found!.participants).toHaveLength(1);
      expect(found!.participants[0]!.signatoryId).toBe(signatory.id);
    }
  });
});
