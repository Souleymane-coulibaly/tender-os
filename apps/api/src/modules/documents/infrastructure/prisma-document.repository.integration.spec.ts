import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { ConcurrentVersionCreationError } from "../domain/errors";
import { DocumentDomain } from "../domain/document-domain";
import { DocumentId } from "../domain/document-id.value-object";
import { DocumentOrigin } from "../domain/document-origin";
import { DocumentVersion } from "../domain/document-version.entity";
import { Document } from "../domain/document.aggregate";
import { PrismaDocumentRepository } from "./prisma-document.repository";

describe("PrismaDocumentRepository (PostgreSQL)", () => {
  const prisma = new PrismaService();
  const repository = new PrismaDocumentRepository(prisma);
  const organizationId = randomUUID();
  const createdDocumentIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.create({
      data: {
        id: organizationId,
        name: "Documents Integration Test Org",
        slug: `documents-integration-test-org-${organizationId}`,
        defaultTimezone: "Europe/Paris",
        status: "TRIAL",
      },
    });
  });

  afterAll(async () => {
    if (createdDocumentIds.length > 0) {
      await prisma.document.updateMany({
        where: { id: { in: createdDocumentIds } },
        data: { currentVersionId: null },
      });
      await prisma.documentVersion.deleteMany({ where: { documentId: { in: createdDocumentIds } } });
      await prisma.document.deleteMany({ where: { id: { in: createdDocumentIds } } });
    }
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  function createDocument(
    title: string,
    overrides: { origin?: DocumentOrigin; domain?: DocumentDomain } = {},
  ): Document {
    const id = randomUUID();
    createdDocumentIds.push(id);
    return Document.create({
      id: DocumentId.from(id),
      organizationId,
      title,
      origin: overrides.origin ?? DocumentOrigin.UserUpload,
      domain: overrides.domain ?? DocumentDomain.Organization,
      createdByUserId: randomUUID(),
      occurredAt: new Date(),
    });
  }

  function createVersion(document: Document, versionNumber: number): DocumentVersion {
    return DocumentVersion.create({
      id: randomUUID(),
      organizationId,
      documentId: document.id.value,
      versionNumber,
      originalFilename: `file-v${versionNumber}.pdf`,
      sanitizedFilename: `file-v${versionNumber}.pdf`,
      mimeType: "application/pdf",
      extension: "pdf",
      sizeBytes: 100,
      checksum: `checksum-${versionNumber}`,
      storageKey: `${organizationId}/${document.id.value}/v${versionNumber}.pdf`,
      uploadedByUserId: document.createdByUserId,
      occurredAt: new Date(),
    });
  }

  it("creates a document with its first version atomically and reads it back", async () => {
    const document = createDocument("Attestation fiscale");
    const version = createVersion(document, 1);
    document.promoteVersion({ versionId: version.id, versionNumber: 1, occurredAt: new Date() });

    await repository.createWithInitialVersion({ document, version });

    const found = await repository.findById({ organizationId, documentId: document.id.value });
    expect(found?.currentVersionId).toBe(version.id);
    expect(found?.currentVersionNumber).toBe(1);
  });

  it("returns null for a document belonging to a different organization", async () => {
    const document = createDocument("Marche isole");
    const version = createVersion(document, 1);
    document.promoteVersion({ versionId: version.id, versionNumber: 1, occurredAt: new Date() });
    await repository.createWithInitialVersion({ document, version });

    const found = await repository.findById({ organizationId: randomUUID(), documentId: document.id.value });
    expect(found).toBeNull();
  });

  it("excludes a soft-deleted document from findById", async () => {
    const document = createDocument("A supprimer");
    const version = createVersion(document, 1);
    document.promoteVersion({ versionId: version.id, versionNumber: 1, occurredAt: new Date() });
    await repository.createWithInitialVersion({ document, version });

    document.softDelete(new Date());
    await repository.save(document);

    const found = await repository.findById({ organizationId, documentId: document.id.value });
    expect(found).toBeNull();
  });

  it("adds a second version and promotes the document to it", async () => {
    const document = createDocument("Document versionne");
    const v1 = createVersion(document, 1);
    document.promoteVersion({ versionId: v1.id, versionNumber: 1, occurredAt: new Date() });
    await repository.createWithInitialVersion({ document, version: v1 });

    const v2 = createVersion(document, 2);
    document.promoteVersion({ versionId: v2.id, versionNumber: 2, occurredAt: new Date() });
    await repository.addVersionAndPromote({ document, version: v2 });

    const found = await repository.findById({ organizationId, documentId: document.id.value });
    expect(found?.currentVersionNumber).toBe(2);
    expect(found?.currentVersionId).toBe(v2.id);
  });

  it("throws ConcurrentVersionCreationError under a real concurrent race for the same version number", async () => {
    const document = createDocument("Document en course");
    const v1 = createVersion(document, 1);
    document.promoteVersion({ versionId: v1.id, versionNumber: 1, occurredAt: new Date() });
    await repository.createWithInitialVersion({ document, version: v1 });

    // Deux "utilisateurs" calculent tous deux versionNumber=2 avant qu'aucun n'écrive —
    // la contrainte unique (documentId, versionNumber) doit rejeter le second.
    const versionA = createVersion(document, 2);
    const versionB = createVersion(document, 2);

    const results = await Promise.allSettled([
      repository.addVersionAndPromote({ document, version: versionA }),
      repository.addVersionAndPromote({ document, version: versionB }),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConcurrentVersionCreationError);
  });

  it("filters by origin/domain and paginates", async () => {
    const dceDocument = createDocument("CCTP du marche", { origin: DocumentOrigin.Dce, domain: DocumentDomain.Tender });
    const dceVersion = createVersion(dceDocument, 1);
    dceDocument.promoteVersion({ versionId: dceVersion.id, versionNumber: 1, occurredAt: new Date() });
    await repository.createWithInitialVersion({ document: dceDocument, version: dceVersion });

    const filtered = await repository.list({ organizationId, limit: 50, origin: DocumentOrigin.Dce });
    expect(filtered.items.map((item) => item.id.value)).toContain(dceDocument.id.value);
    expect(filtered.items.every((item) => item.origin === DocumentOrigin.Dce)).toBe(true);

    const firstPage = await repository.list({ organizationId, limit: 1 });
    expect(firstPage.items).toHaveLength(1);
  });
});
