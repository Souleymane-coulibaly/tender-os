import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { AdministrativeDocumentType } from "../domain/administrative-document-type";
import { AdministrativeDocument } from "../domain/administrative-document.aggregate";
import { AdministrativeDocumentRevision } from "../domain/administrative-document-revision.entity";
import { AdministrativeDossier } from "../domain/administrative-dossier.aggregate";
import { AdministrativeDossierStatus } from "../domain/administrative-dossier-status";
import { DuplicateAdministrativeDossierError } from "../domain/errors";
import { AdministrativeRequirement } from "../domain/administrative-requirement.aggregate";
import { AdministrativeRequirementOrigin } from "../domain/administrative-requirement-origin";
import { PrismaAdministrativeDocumentRepository } from "./prisma-administrative-document.repository";
import { PrismaAdministrativeDocumentRevisionRepository } from "./prisma-administrative-document-revision.repository";
import { PrismaAdministrativeDossierRepository } from "./prisma-administrative-dossier.repository";
import { PrismaAdministrativeRequirementRepository } from "./prisma-administrative-requirement.repository";

/**
 * Sprint 8C Phase 1 — preuve PostgreSQL réelle (même motif que
 * `prisma-deliverables.repository.integration.spec.ts`) : un fake en mémoire ne suffit pas à
 * démontrer que la contrainte `@@unique([organizationId, tenderId])` protège réellement contre une
 * double création concurrente du dossier (mission §6 "un Tender ne doit avoir qu'un dossier
 * administratif principal actif" + "la création doit être idempotente"), ni que les CHECK
 * constraints hand-appended rejettent une valeur hors catalogue, ni qu'un aller-retour réel
 * round-trippe les 4 agrégats correctement.
 */
describe("Administrative Dossier repositories (PostgreSQL réel)", () => {
  const prisma = new PrismaService();
  const dossierRepository = new PrismaAdministrativeDossierRepository(prisma);
  const requirementRepository = new PrismaAdministrativeRequirementRepository(prisma);
  const documentRepository = new PrismaAdministrativeDocumentRepository(prisma);
  const revisionRepository = new PrismaAdministrativeDocumentRevisionRepository(prisma);

  const organizationId = randomUUID();
  const otherOrganizationId = randomUUID();
  const clientAccountId = randomUUID();
  const tenderId = randomUUID();
  const now = new Date("2026-09-04T10:00:00Z");

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.createMany({
      data: [
        { id: organizationId, name: "Administrative Dossier Repo Test Org", slug: `ad-repo-test-org-${organizationId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
        { id: otherOrganizationId, name: "Administrative Dossier Repo Test Org (other)", slug: `ad-repo-test-org-other-${otherOrganizationId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
      ],
    });
    await prisma.clientAccount.create({ data: { id: clientAccountId, organizationId, name: "Client", nameNormalized: "client", status: "ACTIVE", createdBy: randomUUID() } });
    await prisma.tender.create({ data: { id: tenderId, organizationId, clientAccountId, title: "Marché de test", status: "DRAFT", tags: [], createdBy: randomUUID() } });
  });

  afterAll(async () => {
    await prisma.administrativeDocumentRevision.deleteMany({ where: { organizationId: { in: [organizationId, otherOrganizationId] } } });
    await prisma.administrativeDocument.deleteMany({ where: { organizationId: { in: [organizationId, otherOrganizationId] } } });
    await prisma.administrativeRequirement.deleteMany({ where: { organizationId: { in: [organizationId, otherOrganizationId] } } });
    await prisma.administrativeDossier.deleteMany({ where: { organizationId: { in: [organizationId, otherOrganizationId] } } });
    await prisma.tender.deleteMany({ where: { organizationId } });
    await prisma.clientAccount.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: { in: [organizationId, otherOrganizationId] } } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.administrativeDocumentRevision.deleteMany({ where: { organizationId } });
    await prisma.administrativeDocument.deleteMany({ where: { organizationId } });
    await prisma.administrativeRequirement.deleteMany({ where: { organizationId } });
    await prisma.administrativeDossier.deleteMany({ where: { organizationId } });
  });

  it("persists an AdministrativeDossier and reads it back with the same shape", async () => {
    const dossier = AdministrativeDossier.create({ id: randomUUID(), organizationId, clientAccountId, tenderId, occurredAt: now });
    await dossierRepository.create(dossier);

    const found = await dossierRepository.findByTenderId({ organizationId, tenderId });
    expect(found?.id).toBe(dossier.id);
    expect(found?.status).toBe(AdministrativeDossierStatus.Incomplete);
    expect(found?.completionPercentage).toBe(0);
    expect(found?.validationStatus).toBe("NOT_VALIDATED");
  });

  it("@@unique([organizationId, tenderId]) — repeated concurrent creation attempts never leave two dossiers for the same tender (real Postgres) — repeated ×3", async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await prisma.administrativeDossier.deleteMany({ where: { organizationId } });

      const dossierA = AdministrativeDossier.create({ id: randomUUID(), organizationId, clientAccountId, tenderId, occurredAt: now });
      const dossierB = AdministrativeDossier.create({ id: randomUUID(), organizationId, clientAccountId, tenderId, occurredAt: now });

      const results = await Promise.allSettled([dossierRepository.create(dossierA), dossierRepository.create(dossierB)]);

      // Exactement une des deux tentatives réussit ; l'autre échoue avec l'erreur DOMAINE dédiée
      // (jamais une PrismaClientKnownRequestError brute qui fuiterait jusqu'au contrôleur).
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(DuplicateAdministrativeDossierError);

      const countInDb = await prisma.administrativeDossier.count({ where: { organizationId, tenderId } });
      expect(countInDb).toBe(1);
    }
  });

  it("rejects an invalid status at the database level (hand-appended CHECK constraint, never a native Prisma enum)", async () => {
    const dossierId = randomUUID();
    await expect(
      prisma.$executeRaw`INSERT INTO administrative_dossiers (id, organization_id, client_account_id, tender_id, status, updated_at)
        VALUES (${dossierId}::uuid, ${organizationId}::uuid, ${clientAccountId}::uuid, ${tenderId}::uuid, 'NOT_A_REAL_STATUS', now())`,
    ).rejects.toThrow();
    expect(await prisma.administrativeDossier.count({ where: { id: dossierId } })).toBe(0);
  });

  it("persists an AdministrativeRequirement and reads it back with the same shape, including origin/validationStatus", async () => {
    const requirement = AdministrativeRequirement.create({
      id: randomUUID(),
      organizationId,
      tenderId,
      title: "Attestation fiscale",
      requirementType: "DOCUMENT",
      expectedDocumentType: AdministrativeDocumentType.AttestationFiscale,
      required: true,
      origin: AdministrativeRequirementOrigin.DceAnalysis,
      createdBy: randomUUID(),
      occurredAt: now,
    });
    await requirementRepository.create(requirement);

    const found = await requirementRepository.findById({ organizationId, requirementId: requirement.id });
    expect(found?.title).toBe("Attestation fiscale");
    expect(found?.origin).toBe(AdministrativeRequirementOrigin.DceAnalysis);
    expect(found?.validationStatus).toBe("SUGGESTED");

    const listed = await requirementRepository.listByTender({ organizationId, tenderId });
    expect(listed).toHaveLength(1);

    const confirmedBeforeDecision = await requirementRepository.listConfirmedByTender({ organizationId, tenderId });
    expect(confirmedBeforeDecision).toHaveLength(0);

    found!.confirm({ validatedBy: randomUUID(), occurredAt: now });
    await requirementRepository.save(found!);
    const confirmedAfterDecision = await requirementRepository.listConfirmedByTender({ organizationId, tenderId });
    expect(confirmedAfterDecision).toHaveLength(1);
  });

  it("AdministrativeDocument + AdministrativeDocumentRevision round-trip through Postgres, including the frozen validatedRevisionId pointer", async () => {
    const dossier = AdministrativeDossier.create({ id: randomUUID(), organizationId, clientAccountId, tenderId, occurredAt: now });
    await dossierRepository.create(dossier);

    const document = AdministrativeDocument.create({
      id: randomUUID(),
      organizationId,
      administrativeDossierId: dossier.id,
      tenderId,
      documentType: AdministrativeDocumentType.Rib,
      label: "RIB",
      createdBy: randomUUID(),
      occurredAt: now,
    });
    await documentRepository.create(document);

    const revision = AdministrativeDocumentRevision.create({ id: randomUUID(), organizationId, administrativeDocumentId: document.id, revisionNumber: 1, createdBy: randomUUID(), occurredAt: now });
    revision.attachDocument({ documentId: randomUUID(), documentVersionId: randomUUID(), documentChecksum: "abc123", documentFileName: "rib.pdf", documentMimeType: "application/pdf", occurredAt: now });
    revision.submitForReview(now);
    revision.validate(now);
    await revisionRepository.create(revision);

    document.markValidated({ revisionId: revision.id, validatedBy: randomUUID(), occurredAt: now });
    await documentRepository.save(document);

    const foundDocument = await documentRepository.findById({ organizationId, documentId: document.id });
    expect(foundDocument?.validatedRevisionId).toBe(revision.id);

    const foundRevisions = await revisionRepository.listByDocument({ organizationId, administrativeDocumentId: document.id });
    expect(foundRevisions).toHaveLength(1);
    expect(foundRevisions[0]?.documentChecksum).toBe("abc123");
    expect(foundRevisions[0]?.status).toBe("VALIDATED");

    const byDossier = await documentRepository.listByDossier({ organizationId, administrativeDossierId: dossier.id });
    expect(byDossier).toHaveLength(1);
  });

  it("@@unique([administrativeDocumentId, revisionNumber]) rejects a duplicate revision number at the database level", async () => {
    const dossier = AdministrativeDossier.create({ id: randomUUID(), organizationId, clientAccountId, tenderId, occurredAt: now });
    await dossierRepository.create(dossier);
    const document = AdministrativeDocument.create({
      id: randomUUID(),
      organizationId,
      administrativeDossierId: dossier.id,
      tenderId,
      documentType: AdministrativeDocumentType.Rib,
      label: "RIB",
      createdBy: randomUUID(),
      occurredAt: now,
    });
    await documentRepository.create(document);

    const revision1 = AdministrativeDocumentRevision.create({ id: randomUUID(), organizationId, administrativeDocumentId: document.id, revisionNumber: 1, createdBy: randomUUID(), occurredAt: now });
    await revisionRepository.create(revision1);

    const duplicateRevision = AdministrativeDocumentRevision.create({ id: randomUUID(), organizationId, administrativeDocumentId: document.id, revisionNumber: 1, createdBy: randomUUID(), occurredAt: now });
    await expect(revisionRepository.create(duplicateRevision)).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });

  it("tenant isolation — organization A cannot read organization B's dossier or requirement", async () => {
    const dossier = AdministrativeDossier.create({ id: randomUUID(), organizationId, clientAccountId, tenderId, occurredAt: now });
    await dossierRepository.create(dossier);
    expect(await dossierRepository.findById({ organizationId: otherOrganizationId, dossierId: dossier.id })).toBeNull();
    expect(await dossierRepository.findByTenderId({ organizationId: otherOrganizationId, tenderId })).toBeNull();

    const requirement = AdministrativeRequirement.create({
      id: randomUUID(),
      organizationId,
      tenderId,
      title: "Attestation fiscale",
      requirementType: "DOCUMENT",
      expectedDocumentType: AdministrativeDocumentType.AttestationFiscale,
      required: true,
      origin: AdministrativeRequirementOrigin.Manual,
      createdBy: randomUUID(),
      occurredAt: now,
    });
    await requirementRepository.create(requirement);
    expect(await requirementRepository.findById({ organizationId: otherOrganizationId, requirementId: requirement.id })).toBeNull();
  });
});
