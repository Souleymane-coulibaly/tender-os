import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { DocumentDomain } from "../../documents/domain/document-domain";
import { DocumentId } from "../../documents/domain/document-id.value-object";
import { DocumentOrigin } from "../../documents/domain/document-origin";
import { DocumentVersion } from "../../documents/domain/document-version.entity";
import { Document } from "../../documents/domain/document.aggregate";
import { PrismaDocumentRepository } from "../../documents/infrastructure/prisma-document.repository";
import { Dce } from "../domain/dce.aggregate";
import { DceDocument } from "../domain/dce-document.entity";
import { DceDocumentCategory } from "../domain/dce-document-category";
import { DceId } from "../domain/dce-id.value-object";
import { PrismaDceDocumentRepository } from "./prisma-dce-document.repository";
import { PrismaDceRepository } from "./prisma-dce.repository";

describe("PrismaDceDocumentRepository (PostgreSQL)", () => {
  const prisma = new PrismaService();
  const documentRepository = new PrismaDocumentRepository(prisma);
  const dceRepository = new PrismaDceRepository(prisma);
  const repository = new PrismaDceDocumentRepository(prisma);

  const organizationId = randomUUID();
  const tenderId = randomUUID();
  const actorId = randomUUID();
  const createdDocumentIds: string[] = [];
  const createdDceIds: string[] = [];

  let dce: Dce;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.create({
      data: {
        id: organizationId,
        name: "DCE Document Repository Integration Test Org",
        slug: `dce-document-repo-integration-test-org-${organizationId}`,
        defaultTimezone: "Europe/Paris",
        status: "TRIAL",
      },
    });
    const clientAccount = await prisma.clientAccount.create({
      data: {
        id: randomUUID(),
        organizationId,
        name: "Client de test",
        nameNormalized: "client de test",
        status: "ACTIVE",
        createdBy: actorId,
      },
    });
    await prisma.tender.create({
      data: {
        id: tenderId,
        organizationId,
        clientAccountId: clientAccount.id,
        title: "Marche pour tests DceDocument",
        status: "DRAFT",
        tags: [],
        createdBy: actorId,
      },
    });

    dce = Dce.create({
      id: DceId.from(randomUUID()),
      organizationId,
      tenderId,
      createdByUserId: actorId,
      occurredAt: new Date(),
    });
    createdDceIds.push(dce.id.value);
    await dceRepository.create(dce);
  });

  afterAll(async () => {
    await prisma.dceDocument.deleteMany({ where: { dceId: { in: createdDceIds } } });
    await prisma.dce.deleteMany({ where: { id: { in: createdDceIds } } });
    if (createdDocumentIds.length > 0) {
      await prisma.document.updateMany({
        where: { id: { in: createdDocumentIds } },
        data: { currentVersionId: null },
      });
      await prisma.documentVersion.deleteMany({ where: { documentId: { in: createdDocumentIds } } });
      await prisma.document.deleteMany({ where: { id: { in: createdDocumentIds } } });
    }
    await prisma.tender.delete({ where: { id: tenderId } });
    await prisma.clientAccount.deleteMany({ where: { organizationId } });
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  async function createDocumentWithVersion(input: {
    originalFilename: string;
    checksum: string;
    deleted?: boolean;
  }): Promise<Document> {
    const id = randomUUID();
    createdDocumentIds.push(id);
    const document = Document.create({
      id: DocumentId.from(id),
      organizationId,
      title: input.originalFilename,
      origin: DocumentOrigin.Dce,
      domain: DocumentDomain.Tender,
      createdByUserId: actorId,
      occurredAt: new Date(),
    });
    const version = DocumentVersion.create({
      id: randomUUID(),
      organizationId,
      documentId: document.id.value,
      versionNumber: 1,
      originalFilename: input.originalFilename,
      sanitizedFilename: input.originalFilename,
      mimeType: "application/pdf",
      extension: "pdf",
      sizeBytes: 42,
      checksum: input.checksum,
      storageKey: `${organizationId}/${document.id.value}/v1.pdf`,
      uploadedByUserId: actorId,
      occurredAt: new Date(),
    });
    document.promoteVersion({ versionId: version.id, versionNumber: 1, occurredAt: new Date() });
    await documentRepository.createWithInitialVersion({ document, version });

    if (input.deleted) {
      document.softDelete(new Date());
      await documentRepository.save(document);
    }

    return document;
  }

  it("creates a link and lists an enriched summary joined from Document/DocumentVersion", async () => {
    const document = await createDocumentWithVersion({ originalFilename: "cctp.pdf", checksum: "hash-1" });
    const link = DceDocument.create({
      dceId: dce.id.value,
      documentId: document.id.value,
      organizationId,
      createdByUserId: actorId,
      category: DceDocumentCategory.Other,
      occurredAt: new Date(),
    });
    await repository.create(link);

    const summaries = await repository.listSummariesByDceId({ organizationId, dceId: dce.id.value });
    const summary = summaries.find((item) => item.documentId === document.id.value);

    expect(summary).toBeDefined();
    expect(summary?.originalFilename).toBe("cctp.pdf");
    expect(summary?.checksum).toBe("hash-1");
    expect(summary?.sizeBytes).toBe(42);
  });

  it("excludes a soft-deleted document from listSummariesByDceId", async () => {
    const document = await createDocumentWithVersion({
      originalFilename: "deleted.pdf",
      checksum: "hash-deleted",
      deleted: true,
    });
    await repository.create(
      DceDocument.create({
        dceId: dce.id.value,
        documentId: document.id.value,
        organizationId,
        createdByUserId: actorId,
        category: DceDocumentCategory.Other,
        occurredAt: new Date(),
      }),
    );

    const summaries = await repository.listSummariesByDceId({ organizationId, dceId: dce.id.value });
    expect(summaries.some((item) => item.documentId === document.id.value)).toBe(false);
  });

  it("finds an active document by checksum (duplicate detection) and returns null for an unknown checksum", async () => {
    await createDocumentWithVersion({ originalFilename: "reglement.pdf", checksum: "hash-unique-1" }).then(
      async (document) => {
        await repository.create(
          DceDocument.create({
            dceId: dce.id.value,
            documentId: document.id.value,
            organizationId,
            createdByUserId: actorId,
            category: DceDocumentCategory.Other,
            occurredAt: new Date(),
          }),
        );
      },
    );

    const found = await repository.findActiveByChecksum({ organizationId, dceId: dce.id.value, checksum: "hash-unique-1" });
    expect(found?.checksum).toBe("hash-unique-1");

    const notFound = await repository.findActiveByChecksum({
      organizationId,
      dceId: dce.id.value,
      checksum: "does-not-exist",
    });
    expect(notFound).toBeNull();
  });

  it("counts only active (non-deleted) documents", async () => {
    const before = await repository.countActiveByDceId({ organizationId, dceId: dce.id.value });

    const document = await createDocumentWithVersion({ originalFilename: "extra.pdf", checksum: "hash-extra" });
    await repository.create(
      DceDocument.create({
        dceId: dce.id.value,
        documentId: document.id.value,
        organizationId,
        createdByUserId: actorId,
        category: DceDocumentCategory.Other,
        occurredAt: new Date(),
      }),
    );

    const after = await repository.countActiveByDceId({ organizationId, dceId: dce.id.value });
    expect(after).toBe(before + 1);
  });

  it("rejects at the database level a dce_document row whose organizationId does not match the referenced Document", async () => {
    const document = await createDocumentWithVersion({ originalFilename: "mismatch.pdf", checksum: "hash-mismatch" });
    const otherOrganizationId = randomUUID();

    await expect(
      prisma.dceDocument.create({
        data: {
          dceId: dce.id.value,
          documentId: document.id.value,
          organizationId: otherOrganizationId, // incohérent avec le Document réel
          createdByUserId: actorId,
        },
      }),
    ).rejects.toThrow();
  });
});
