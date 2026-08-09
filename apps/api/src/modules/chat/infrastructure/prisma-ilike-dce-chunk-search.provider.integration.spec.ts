import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { DocumentDomain } from "../../documents/domain/document-domain";
import { DocumentId } from "../../documents/domain/document-id.value-object";
import { DocumentOrigin } from "../../documents/domain/document-origin";
import { DocumentVersion } from "../../documents/domain/document-version.entity";
import { Document } from "../../documents/domain/document.aggregate";
import { PrismaDocumentRepository } from "../../documents/infrastructure/prisma-document.repository";
import { PrismaIlikeDceChunkSearchProvider } from "./prisma-ilike-dce-chunk-search.provider";

/**
 * Correctif audit Codex round 2 P1 (Chat IA conversationnel, décision utilisateur — "track it for
 * real in Extraction") — preuve réelle contre PostgreSQL du scénario exact décrit dans l'audit :
 *
 *   Document V1 → extraction → chunk A → citation
 *   puis upload Document V2
 *   → le Chat doit TOUJOURS citer V1 pour ce chunk, JAMAIS Document.currentVersionId (= V2)
 *
 * puis :
 *
 *   Nouvelle extraction après V2 → le nouveau chunk cite bien V2
 */
describe("PrismaIlikeDceChunkSearchProvider — provenance exacte de version (PostgreSQL réel)", () => {
  const prisma = new PrismaService();
  const documentRepository = new PrismaDocumentRepository(prisma);
  const provider = new PrismaIlikeDceChunkSearchProvider(prisma);

  const organizationId = randomUUID();
  const actorId = randomUUID();
  let tenderId: string;
  let dceId: string;
  let documentId: string;
  let versionV1Id: string;

  async function createDocumentVersion(input: { versionNumber: number; filename: string }): Promise<string> {
    const version = DocumentVersion.create({
      id: randomUUID(),
      organizationId,
      documentId,
      versionNumber: input.versionNumber,
      originalFilename: input.filename,
      sanitizedFilename: input.filename,
      mimeType: "application/pdf",
      extension: "pdf",
      sizeBytes: 42,
      checksum: `checksum-${randomUUID()}`,
      storageKey: `${organizationId}/${documentId}/v${input.versionNumber}.pdf`,
      uploadedByUserId: actorId,
      occurredAt: new Date(),
    });
    await prisma.documentVersion.create({
      data: {
        id: version.id,
        organizationId,
        documentId,
        versionNumber: version.versionNumber,
        originalFilename: version.originalFilename,
        sanitizedFilename: version.sanitizedFilename,
        mimeType: version.mimeType,
        extension: version.extension,
        sizeBytes: version.sizeBytes,
        checksum: version.checksum,
        storageKey: version.storageKey,
        uploadedByUserId: actorId,
      },
    });
    return version.id;
  }

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.create({
      data: { id: organizationId, name: "Chat DCE Version Test Org", slug: `chat-dce-version-test-org-${organizationId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
    });
    const clientAccount = await prisma.clientAccount.create({
      data: { id: randomUUID(), organizationId, name: "Client de test", nameNormalized: `client de test ${organizationId}`, status: "ACTIVE", createdBy: actorId },
    });
    const tender = await prisma.tender.create({
      data: { id: randomUUID(), organizationId, clientAccountId: clientAccount.id, title: "Marché pour test provenance DCE", status: "DRAFT", tags: [], createdBy: actorId },
    });
    tenderId = tender.id;
    const dce = await prisma.dce.create({ data: { id: randomUUID(), organizationId, tenderId, status: "IMPORTED", createdByUserId: actorId } });
    dceId = dce.id;

    const document = Document.create({ id: DocumentId.from(randomUUID()), organizationId, title: "CCTP.pdf", origin: DocumentOrigin.Dce, domain: DocumentDomain.Tender, createdByUserId: actorId, occurredAt: new Date() });
    documentId = document.id.value;
    const initialVersion = DocumentVersion.create({
      id: randomUUID(),
      organizationId,
      documentId,
      versionNumber: 1,
      originalFilename: "CCTP-v1.pdf",
      sanitizedFilename: "CCTP-v1.pdf",
      mimeType: "application/pdf",
      extension: "pdf",
      sizeBytes: 42,
      checksum: `checksum-${randomUUID()}`,
      storageKey: `${organizationId}/${documentId}/v1.pdf`,
      uploadedByUserId: actorId,
      occurredAt: new Date(),
    });
    document.promoteVersion({ versionId: initialVersion.id, versionNumber: 1, occurredAt: new Date() });
    await documentRepository.createWithInitialVersion({ document, version: initialVersion });
    versionV1Id = initialVersion.id;

    await prisma.dceDocument.create({ data: { dceId, documentId, organizationId, createdByUserId: actorId, category: "TECHNICAL" } });
  }, 30000);

  afterAll(async () => {
    await prisma.extractionChunk.deleteMany({ where: { organizationId } });
    await prisma.documentExtraction.deleteMany({ where: { organizationId } });
    await prisma.dceDocument.deleteMany({ where: { dceId } });
    await prisma.dce.deleteMany({ where: { id: dceId } });
    await prisma.document.update({ where: { id: documentId }, data: { currentVersionId: null } });
    await prisma.documentVersion.deleteMany({ where: { documentId } });
    await prisma.document.delete({ where: { id: documentId } });
    await prisma.tender.deleteMany({ where: { organizationId } });
    await prisma.clientAccount.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.$disconnect();
  }, 30000);

  it("Document V1 → extraction → chunk cites V1", async () => {
    await prisma.documentExtraction.create({
      data: { documentId, dceId, organizationId, status: "SUCCEEDED", attemptCount: 1, documentVersionId: versionV1Id },
    });
    await prisma.extractionChunk.create({
      data: { id: randomUUID(), documentId, organizationId, sequence: 0, content: "Le loyer initial est fixé à 12000 euros par an.", characterCount: 47, checksum: `checksum-${randomUUID()}` },
    });

    const matches = await provider.search({ organizationId, tenderId, query: "loyer", limit: 10 });
    expect(matches).toHaveLength(1);
    expect(matches[0]?.documentVersionId).toBe(versionV1Id);
  });

  it("BLOQUANT — after uploading Document V2, the SAME (already-extracted) chunk still cites V1, NEVER Document.currentVersionId (= V2)", async () => {
    const versionV2Id = await createDocumentVersion({ versionNumber: 2, filename: "CCTP-v2.pdf" });
    await prisma.document.update({ where: { id: documentId }, data: { currentVersionId: versionV2Id, currentVersionNumber: 2 } });

    // Preuve directe que le Document a bien avancé — sans quoi le test ne prouverait rien.
    const document = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    expect(document.currentVersionId).toBe(versionV2Id);
    expect(document.currentVersionId).not.toBe(versionV1Id);

    const matches = await provider.search({ organizationId, tenderId, query: "loyer", limit: 10 });
    expect(matches).toHaveLength(1);
    expect(matches[0]?.documentVersionId).toBe(versionV1Id);
    expect(matches[0]?.documentVersionId).not.toBe(versionV2Id);
  });

  it("a NEW extraction performed after V2 correctly cites V2 for its own (new) chunk", async () => {
    const versionV2Id = (await prisma.document.findUniqueOrThrow({ where: { id: documentId } })).currentVersionId!;

    // Une ré-extraction remplace le résultat de l'extraction précédente (même document, même
    // relation 1:1 DocumentExtraction↔Document) — même motif que `finalizeAttempt` en production.
    await prisma.extractionChunk.deleteMany({ where: { documentId, organizationId } });
    await prisma.documentExtraction.update({ where: { documentId }, data: { documentVersionId: versionV2Id } });
    await prisma.extractionChunk.create({
      data: { id: randomUUID(), documentId, organizationId, sequence: 0, content: "Le loyer révisé est désormais de 15000 euros par an.", characterCount: 53, checksum: `checksum-${randomUUID()}` },
    });

    const matches = await provider.search({ organizationId, tenderId, query: "loyer", limit: 10 });
    expect(matches).toHaveLength(1);
    expect(matches[0]?.documentVersionId).toBe(versionV2Id);
  });
});
