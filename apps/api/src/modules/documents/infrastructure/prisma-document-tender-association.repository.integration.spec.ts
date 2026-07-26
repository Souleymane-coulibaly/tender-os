import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { DocumentDomain } from "../domain/document-domain";
import { DocumentId } from "../domain/document-id.value-object";
import { DocumentOrigin } from "../domain/document-origin";
import { DocumentTenderAssociation } from "../domain/document-tender-association.entity";
import { DocumentVersion } from "../domain/document-version.entity";
import { Document } from "../domain/document.aggregate";
import { PrismaDocumentRepository } from "./prisma-document.repository";
import { PrismaDocumentTenderAssociationRepository } from "./prisma-document-tender-association.repository";

describe("PrismaDocumentTenderAssociationRepository (PostgreSQL)", () => {
  const prisma = new PrismaService();
  const documentRepository = new PrismaDocumentRepository(prisma);
  const associationRepository = new PrismaDocumentTenderAssociationRepository(prisma);
  const organizationId = randomUUID();
  const tenderId = randomUUID();
  const documentId = randomUUID();

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.create({
      data: {
        id: organizationId,
        name: "Association Integration Test Org",
        slug: `association-integration-test-org-${organizationId}`,
        defaultTimezone: "Europe/Paris",
        status: "TRIAL",
      },
    });
    await prisma.tender.create({
      data: {
        id: tenderId,
        organizationId,
        title: "Marche pour tests d'association",
        status: "DRAFT",
        tags: [],
        createdBy: randomUUID(),
      },
    });

    const document = Document.create({
      id: DocumentId.from(documentId),
      organizationId,
      title: "Document a associer",
      origin: DocumentOrigin.UserUpload,
      domain: DocumentDomain.Organization,
      createdByUserId: randomUUID(),
      occurredAt: new Date(),
    });
    const version = DocumentVersion.create({
      id: randomUUID(),
      organizationId,
      documentId,
      versionNumber: 1,
      originalFilename: "doc.pdf",
      sanitizedFilename: "doc.pdf",
      mimeType: "application/pdf",
      extension: "pdf",
      sizeBytes: 10,
      checksum: "checksum",
      storageKey: `${organizationId}/${documentId}/v1.pdf`,
      uploadedByUserId: document.createdByUserId,
      occurredAt: new Date(),
    });
    document.promoteVersion({ versionId: version.id, versionNumber: 1, occurredAt: new Date() });
    await documentRepository.createWithInitialVersion({ document, version });
  });

  afterAll(async () => {
    await prisma.documentTenderAssociation.deleteMany({ where: { documentId } });
    await prisma.document.update({ where: { id: documentId }, data: { currentVersionId: null } });
    await prisma.documentVersion.deleteMany({ where: { documentId } });
    await prisma.document.delete({ where: { id: documentId } });
    await prisma.tender.delete({ where: { id: tenderId } });
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  it("creates an association and reports it as existing", async () => {
    const association = DocumentTenderAssociation.create({
      documentId,
      tenderId,
      organizationId,
      createdByUserId: randomUUID(),
      occurredAt: new Date(),
    });

    await associationRepository.create(association);

    expect(await associationRepository.exists({ organizationId, documentId, tenderId })).toBe(true);
  });

  it("rejects a duplicate association at the database level (unique constraint)", async () => {
    const duplicate = DocumentTenderAssociation.create({
      documentId,
      tenderId,
      organizationId,
      createdByUserId: randomUUID(),
      occurredAt: new Date(),
    });

    await expect(associationRepository.create(duplicate)).rejects.toThrow();
  });

  it("does not report an association as existing for a different organization", async () => {
    expect(await associationRepository.exists({ organizationId: randomUUID(), documentId, tenderId })).toBe(false);
  });

  it("deletes the association without touching the document", async () => {
    await associationRepository.delete({ organizationId, documentId, tenderId });

    expect(await associationRepository.exists({ organizationId, documentId, tenderId })).toBe(false);
    const document = await documentRepository.findById({ organizationId, documentId });
    expect(document).not.toBeNull();
  });
});
