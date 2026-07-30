import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { DocumentDomain } from "../../documents/domain/document-domain";
import { DocumentId } from "../../documents/domain/document-id.value-object";
import { DocumentOrigin } from "../../documents/domain/document-origin";
import { DocumentVersion } from "../../documents/domain/document-version.entity";
import { Document } from "../../documents/domain/document.aggregate";
import { PrismaDocumentRepository } from "../../documents/infrastructure/prisma-document.repository";
import { KnowledgeCategory } from "../domain/knowledge-category";
import { KnowledgeDocument } from "../domain/knowledge-document.entity";
import { KnowledgeEntry } from "../domain/knowledge-entry.aggregate";
import { KnowledgeEntryVersion } from "../domain/knowledge-entry-version.entity";
import { KnowledgeSourceType } from "../domain/knowledge-source-type";
import { KnowledgeSpace } from "../domain/knowledge-space.aggregate";
import { PrismaIlikeKnowledgeSearchProvider } from "./prisma-ilike-knowledge-search.provider";
import { PrismaKnowledgeChunkRepository } from "./prisma-knowledge-chunk.repository";
import { PrismaKnowledgeDocumentRepository } from "./prisma-knowledge-document.repository";
import { PrismaKnowledgeEntryRepository } from "./prisma-knowledge-entry.repository";
import { PrismaKnowledgeEntryVersionRepository } from "./prisma-knowledge-entry-version.repository";
import { PrismaKnowledgeSpaceRepository } from "./prisma-knowledge-space.repository";
import { PrismaKnowledgeTagRepository } from "./prisma-knowledge-tag.repository";

describe("Knowledge Base Prisma repositories (PostgreSQL)", () => {
  const prisma = new PrismaService();
  const spaceRepository = new PrismaKnowledgeSpaceRepository(prisma);
  const entryRepository = new PrismaKnowledgeEntryRepository(prisma);
  const versionRepository = new PrismaKnowledgeEntryVersionRepository(prisma);
  const documentRepository = new PrismaKnowledgeDocumentRepository(prisma);
  const chunkRepository = new PrismaKnowledgeChunkRepository(prisma);
  const tagRepository = new PrismaKnowledgeTagRepository(prisma);
  const searchProvider = new PrismaIlikeKnowledgeSearchProvider(prisma);
  const documentModuleRepository = new PrismaDocumentRepository(prisma);

  const organizationId = randomUUID();
  const otherOrganizationId = randomUUID();
  const actorId = randomUUID();
  let spaceId: string;
  let otherSpaceId: string;
  let storedDocumentId: string;
  const createdDocumentIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.create({
      data: { id: organizationId, name: "KB Integration Test Org", slug: `kb-integration-test-org-${organizationId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
    });
    await prisma.organization.create({
      data: { id: otherOrganizationId, name: "KB Integration Test Org (other)", slug: `kb-integration-test-org-other-${otherOrganizationId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
    });

    const space = KnowledgeSpace.create({ id: randomUUID(), organizationId, name: "Base de connaissances", occurredAt: new Date() });
    await spaceRepository.create(space);
    spaceId = space.id;

    const otherSpace = KnowledgeSpace.create({ id: randomUUID(), organizationId: otherOrganizationId, name: "Base de connaissances", occurredAt: new Date() });
    await spaceRepository.create(otherSpace);
    otherSpaceId = otherSpace.id;

    storedDocumentId = await createDocument();
  });

  afterAll(async () => {
    await prisma.knowledgeEntryTag.deleteMany({ where: { organizationId: { in: [organizationId, otherOrganizationId] } } });
    await prisma.knowledgeTag.deleteMany({ where: { organizationId: { in: [organizationId, otherOrganizationId] } } });
    await prisma.knowledgeChunk.deleteMany({ where: { organizationId: { in: [organizationId, otherOrganizationId] } } });
    await prisma.knowledgeDocument.deleteMany({ where: { organizationId: { in: [organizationId, otherOrganizationId] } } });
    await prisma.knowledgeEntryVersion.deleteMany({ where: { organizationId: { in: [organizationId, otherOrganizationId] } } });
    await prisma.knowledgeEntry.deleteMany({ where: { organizationId: { in: [organizationId, otherOrganizationId] } } });
    await prisma.knowledgeSpace.deleteMany({ where: { organizationId: { in: [organizationId, otherOrganizationId] } } });
    if (createdDocumentIds.length > 0) {
      await prisma.documentVersion.deleteMany({ where: { documentId: { in: createdDocumentIds } } });
      await prisma.document.deleteMany({ where: { id: { in: createdDocumentIds } } });
    }
    await prisma.auditLog.deleteMany({ where: { organizationId: { in: [organizationId, otherOrganizationId] } } });
    await prisma.organization.deleteMany({ where: { id: { in: [organizationId, otherOrganizationId] } } });
    await prisma.$disconnect();
  });

  async function createDocument(): Promise<string> {
    const id = randomUUID();
    createdDocumentIds.push(id);
    const document = Document.create({
      id: DocumentId.from(id),
      organizationId,
      title: "cv-jean-dupont.pdf",
      origin: DocumentOrigin.UserUpload,
      domain: DocumentDomain.Knowledge,
      createdByUserId: actorId,
      occurredAt: new Date(),
    });
    const version = DocumentVersion.create({
      id: randomUUID(),
      organizationId,
      documentId: document.id.value,
      versionNumber: 1,
      originalFilename: "cv-jean-dupont.pdf",
      sanitizedFilename: "cv-jean-dupont.pdf",
      mimeType: "application/pdf",
      extension: "pdf",
      sizeBytes: 1000,
      checksum: `checksum-${id}`,
      storageKey: `${organizationId}/${document.id.value}/v1.pdf`,
      uploadedByUserId: actorId,
      occurredAt: new Date(),
    });
    document.promoteVersion({ versionId: version.id, versionNumber: 1, occurredAt: new Date() });
    await documentModuleRepository.createWithInitialVersion({ document, version });
    return document.id.value;
  }

  async function createEntry(overrides: { title?: string; category?: string } = {}): Promise<string> {
    const entry = KnowledgeEntry.create({
      id: randomUUID(),
      organizationId,
      knowledgeSpaceId: spaceId,
      title: overrides.title ?? "CV de Jean Dupont",
      category: (overrides.category as KnowledgeCategory) ?? KnowledgeCategory.ConsultantProfile,
      sourceType: KnowledgeSourceType.Manual,
      metadata: { fullName: "Jean Dupont" },
      createdByUserId: actorId,
      occurredAt: new Date(),
    });
    await entryRepository.create(entry);
    return entry.id;
  }

  describe("KnowledgeSpaceRepository", () => {
    it("resolves the same space by (organizationId, name) idempotently", async () => {
      const found = await spaceRepository.findByOrganizationAndName({ organizationId, name: "Base de connaissances" });
      expect(found?.id).toBe(spaceId);
    });

    it("rejects a duplicate (organizationId, name) at the database level", async () => {
      await expect(
        prisma.knowledgeSpace.create({ data: { id: randomUUID(), organizationId, name: "Base de connaissances", createdAt: new Date(), updatedAt: new Date() } }),
      ).rejects.toThrow();
    });
  });

  describe("KnowledgeEntryRepository", () => {
    it("creates and retrieves an entry, never leaking it to another organization", async () => {
      const entryId = await createEntry();
      const found = await entryRepository.findById({ organizationId, knowledgeEntryId: entryId });
      expect(found?.title).toBe("CV de Jean Dupont");

      const leaked = await entryRepository.findById({ organizationId: otherOrganizationId, knowledgeEntryId: entryId });
      expect(leaked).toBeNull();
    });

    it("lists entries filtered by category, excluding archived by default", async () => {
      const entryId = await createEntry({ title: "Référence Acme", category: KnowledgeCategory.ClientReference });
      const entry = await entryRepository.findById({ organizationId, knowledgeEntryId: entryId });
      entry!.archive(new Date());
      await entryRepository.save(entry!);

      const page = await entryRepository.list({ organizationId, category: KnowledgeCategory.ClientReference, includeArchived: false, limit: 10 });
      expect(page.items.find((item) => item.id === entryId)).toBeUndefined();

      const withArchived = await entryRepository.list({ organizationId, category: KnowledgeCategory.ClientReference, includeArchived: true, limit: 10 });
      expect(withArchived.items.some((item) => item.id === entryId)).toBe(true);
    });

    it("paginates with a cursor", async () => {
      for (let i = 0; i < 3; i++) await createEntry({ title: `Entrée pagination ${i}` });
      const page1 = await entryRepository.list({ organizationId, includeArchived: true, limit: 2 });
      expect(page1.items).toHaveLength(2);
      expect(page1.nextCursor).not.toBeNull();

      const page2 = await entryRepository.list({ organizationId, includeArchived: true, limit: 2, cursor: page1.nextCursor! });
      expect(page2.items[0]!.id).not.toBe(page1.items[0]!.id);
    });

    it("rejects an invalid category value at the database level", async () => {
      const entryId = await createEntry();
      await expect(prisma.$executeRawUnsafe(`UPDATE "knowledge_entries" SET category = 'NOT_A_REAL_CATEGORY' WHERE id = $1`, entryId)).rejects.toThrow();
    });

    /** Correction audit Codex "Anomalie 2" — preuve réelle (Postgres, pas un fake) que
     *  `createWithVersionAndTags` est une transaction unique : un libellé de tag qui dépasse la
     *  limite VARCHAR(60) de la colonne provoque une VRAIE violation de contrainte tardive, APRÈS
     *  que l'entrée et sa version ont déjà été écrites dans la même transaction — la transaction
     *  entière doit alors être annulée par Postgres, sans laisser ni l'entrée, ni la version, ni le
     *  tag survivre. */
    it("createWithVersionAndTags rolls back the entry AND its version when a late tag write violates a real DB constraint", async () => {
      const entry = KnowledgeEntry.create({
        id: randomUUID(),
        organizationId,
        knowledgeSpaceId: spaceId,
        title: "Entrée vouée à échouer",
        category: KnowledgeCategory.Other,
        sourceType: KnowledgeSourceType.Manual,
        metadata: {},
        createdByUserId: actorId,
        occurredAt: new Date(),
      });
      const version = KnowledgeEntryVersion.create({
        id: randomUUID(),
        organizationId,
        knowledgeEntryId: entry.id,
        versionNumber: 1,
        snapshot: { title: entry.title, category: entry.category, metadata: {} },
        createdByUserId: actorId,
        occurredAt: new Date(),
      });
      const oversizedLabel = "x".repeat(61); // dépasse VARCHAR(60) (knowledge_tags.label)

      await expect(
        entryRepository.createWithVersionAndTags({
          entry,
          version,
          tagLabels: [{ label: oversizedLabel, displayLabel: oversizedLabel }],
          occurredAt: new Date(),
          auditEntry: { organizationId, actorType: "USER", actorId, action: "knowledge_entry.created", resourceType: "knowledge_entry", resourceId: entry.id },
        }),
      ).rejects.toThrow();

      expect(await entryRepository.findById({ organizationId, knowledgeEntryId: entry.id })).toBeNull();
      expect(await versionRepository.findByVersionNumber({ organizationId, knowledgeEntryId: entry.id, versionNumber: 1 })).toBeNull();
      expect(await tagRepository.findByLabel({ organizationId, label: oversizedLabel })).toBeNull();
    });

    it("delete() removes the entry AND all its dependent rows (version, document, tag link), but never the shared tag itself", async () => {
      const entryId = await createEntry();
      const entry = (await entryRepository.findById({ organizationId, knowledgeEntryId: entryId }))!;
      entry.archive(new Date());
      await entryRepository.save(entry);

      await versionRepository.create(
        KnowledgeEntryVersion.create({ id: randomUUID(), organizationId, knowledgeEntryId: entryId, versionNumber: 1, snapshot: { title: "v1", category: "OTHER", metadata: {} }, createdByUserId: actorId, occurredAt: new Date() }),
      );
      const document = KnowledgeDocument.create({ id: randomUUID(), organizationId, knowledgeEntryId: entryId, documentId: storedDocumentId, versionNumber: 1, occurredAt: new Date() });
      await documentRepository.create(document);
      const tag = await tagRepository.findOrCreate({ organizationId, label: "tag-suppression-ok", displayLabel: "Tag suppression ok", occurredAt: new Date() });
      await tagRepository.attachToEntry({ organizationId, knowledgeEntryId: entryId, tagId: tag.id, occurredAt: new Date() });

      await entryRepository.delete({
        organizationId,
        knowledgeEntryId: entryId,
        auditEntry: { organizationId, actorType: "USER", actorId, action: "knowledge_entry.deleted", resourceType: "knowledge_entry", resourceId: entryId },
      });

      expect(await entryRepository.findById({ organizationId, knowledgeEntryId: entryId })).toBeNull();
      expect(await versionRepository.findByVersionNumber({ organizationId, knowledgeEntryId: entryId, versionNumber: 1 })).toBeNull();
      expect(await documentRepository.findById({ organizationId, knowledgeDocumentId: document.id })).toBeNull();
      // Le tag lui-même (ressource partagée) survit toujours — seule l'association disparaît.
      expect(await tagRepository.findById({ organizationId, tagId: tag.id })).not.toBeNull();
      // Correction "Corrections Sprint 5" — l'audit de suppression a bien été écrit ATOMIQUEMENT
      // avec la suppression (même transaction).
      const auditRows = await prisma.auditLog.findMany({ where: { organizationId, resourceId: entryId, action: "knowledge_entry.deleted" } });
      expect(auditRows).toHaveLength(1);
    });

    /** Correction audit Codex "Anomalie 2" — preuve réelle qu'un `delete()` qui échoue tardivement
     *  (ici : le garde-fou anti-concurrence final, l'entrée ayant été restaurée entre le contrôle
     *  applicatif et l'exécution de la transaction) ne supprime RIEN — ni les chunks, ni le
     *  document, ni les liens de tags, ni les versions, déjà supprimés PLUS TÔT dans la même
     *  transaction — la transaction entière est annulée par Postgres. */
    it("delete() rolls back everything when the final anti-concurrency guard fails (entry restored mid-race)", async () => {
      const entryId = await createEntry();
      const entry = (await entryRepository.findById({ organizationId, knowledgeEntryId: entryId }))!;
      entry.archive(new Date());
      await entryRepository.save(entry);

      await versionRepository.create(
        KnowledgeEntryVersion.create({ id: randomUUID(), organizationId, knowledgeEntryId: entryId, versionNumber: 1, snapshot: { title: "v1", category: "OTHER", metadata: {} }, createdByUserId: actorId, occurredAt: new Date() }),
      );
      const document = KnowledgeDocument.create({ id: randomUUID(), organizationId, knowledgeEntryId: entryId, documentId: storedDocumentId, versionNumber: 1, occurredAt: new Date() });
      await documentRepository.create(document);
      const tag = await tagRepository.findOrCreate({ organizationId, label: "tag-suppression-race", displayLabel: "Tag suppression race", occurredAt: new Date() });
      await tagRepository.attachToEntry({ organizationId, knowledgeEntryId: entryId, tagId: tag.id, occurredAt: new Date() });

      // Simule la restauration concurrente : l'entrée n'est plus ARCHIVED au moment où la
      // transaction de suppression s'exécute réellement, alors qu'elle l'était au moment du
      // contrôle applicatif (TOCTOU) — le garde-fou DANS la transaction doit refuser.
      await prisma.$executeRawUnsafe(`UPDATE "knowledge_entries" SET status = 'READY' WHERE id = $1::uuid`, entryId);

      await expect(
        entryRepository.delete({
          organizationId,
          knowledgeEntryId: entryId,
          auditEntry: { organizationId, actorType: "USER", actorId, action: "knowledge_entry.deleted", resourceType: "knowledge_entry", resourceId: entryId },
        }),
      ).rejects.toThrow();

      expect(await versionRepository.findByVersionNumber({ organizationId, knowledgeEntryId: entryId, versionNumber: 1 })).not.toBeNull();
      expect(await documentRepository.findById({ organizationId, knowledgeDocumentId: document.id })).not.toBeNull();
      const remainingTags = await tagRepository.listByEntryId({ organizationId, knowledgeEntryId: entryId });
      expect(remainingTags.some((remaining) => remaining.id === tag.id)).toBe(true);
      expect(await entryRepository.findById({ organizationId, knowledgeEntryId: entryId })).not.toBeNull();
      // L'audit "supprimé" ne doit jamais exister pour une suppression finalement refusée.
      const auditRows = await prisma.auditLog.findMany({ where: { organizationId, resourceId: entryId, action: "knowledge_entry.deleted" } });
      expect(auditRows).toHaveLength(0);
    });
  });

  describe("KnowledgeEntryVersionRepository", () => {
    it("creates and lists versions, latest first", async () => {
      const entryId = await createEntry();
      await versionRepository.create(
        KnowledgeEntryVersion.create({ id: randomUUID(), organizationId, knowledgeEntryId: entryId, versionNumber: 1, snapshot: { title: "v1", category: "OTHER", metadata: {} }, createdByUserId: actorId, occurredAt: new Date() }),
      );
      await versionRepository.create(
        KnowledgeEntryVersion.create({ id: randomUUID(), organizationId, knowledgeEntryId: entryId, versionNumber: 2, snapshot: { title: "v2", category: "OTHER", metadata: {} }, createdByUserId: actorId, occurredAt: new Date() }),
      );

      const versions = await versionRepository.listByEntryId({ organizationId, knowledgeEntryId: entryId });
      expect(versions).toHaveLength(2);
      expect(versions[0]!.versionNumber).toBe(2);
    });

    it("rejects a duplicate (organizationId, knowledgeEntryId, versionNumber)", async () => {
      const entryId = await createEntry();
      await versionRepository.create(
        KnowledgeEntryVersion.create({ id: randomUUID(), organizationId, knowledgeEntryId: entryId, versionNumber: 1, snapshot: { title: "v1", category: "OTHER", metadata: {} }, createdByUserId: actorId, occurredAt: new Date() }),
      );
      await expect(
        versionRepository.create(
          KnowledgeEntryVersion.create({ id: randomUUID(), organizationId, knowledgeEntryId: entryId, versionNumber: 1, snapshot: { title: "dup", category: "OTHER", metadata: {} }, createdByUserId: actorId, occurredAt: new Date() }),
        ),
      ).rejects.toThrow();
    });
  });

  describe("KnowledgeDocumentRepository — reserve/finalize atomicity + chunks", () => {
    it("persists chunks atomically with a successful finalization", async () => {
      const entryId = await createEntry();
      const document = KnowledgeDocument.create({ id: randomUUID(), organizationId, knowledgeEntryId: entryId, documentId: storedDocumentId, versionNumber: 1, occurredAt: new Date() });
      await documentRepository.create(document);

      const reservation = await documentRepository.reserveForProcessing({ organizationId, knowledgeDocumentId: document.id, occurredAt: new Date() });
      expect(reservation.kind).toBe("reserved");

      const result = await documentRepository.finalizeAttempt({
        organizationId,
        knowledgeDocumentId: document.id,
        expectedAttemptCount: 1,
        occurredAt: new Date(),
        outcome: { kind: "succeeded", language: "fr", warnings: [] },
        chunks: [{ sequence: 0, content: "Jean Dupont, consultant cloud.", characterCount: 30, checksum: "chk-0" }],
      });
      expect(result.applied).toBe(true);

      const stored = await documentRepository.findById({ organizationId, knowledgeDocumentId: document.id });
      expect(stored?.status).toBe("READY");

      const chunks = await chunkRepository.listByDocumentId({ organizationId, knowledgeDocumentId: document.id });
      expect(chunks).toHaveLength(1);
      expect(chunks[0]!.content).toContain("consultant");
    });

    it("discards a stale finalization (expectedAttemptCount mismatch) — writes nothing", async () => {
      const entryId = await createEntry();
      const document = KnowledgeDocument.create({ id: randomUUID(), organizationId, knowledgeEntryId: entryId, documentId: storedDocumentId, versionNumber: 1, occurredAt: new Date() });
      await documentRepository.create(document);
      await documentRepository.reserveForProcessing({ organizationId, knowledgeDocumentId: document.id, occurredAt: new Date() });

      const result = await documentRepository.finalizeAttempt({
        organizationId,
        knowledgeDocumentId: document.id,
        expectedAttemptCount: 999,
        occurredAt: new Date(),
        outcome: { kind: "succeeded", language: "fr", warnings: [] },
        chunks: [{ sequence: 0, content: "x", characterCount: 1, checksum: "chk" }],
      });
      expect(result.applied).toBe(false);

      const chunks = await chunkRepository.listByDocumentId({ organizationId, knowledgeDocumentId: document.id });
      expect(chunks).toHaveLength(0);
    });

    it("never persists chunks on a failed outcome", async () => {
      const entryId = await createEntry();
      const document = KnowledgeDocument.create({ id: randomUUID(), organizationId, knowledgeEntryId: entryId, documentId: storedDocumentId, versionNumber: 1, occurredAt: new Date() });
      await documentRepository.create(document);
      await documentRepository.reserveForProcessing({ organizationId, knowledgeDocumentId: document.id, occurredAt: new Date() });

      await documentRepository.finalizeAttempt({
        organizationId,
        knowledgeDocumentId: document.id,
        expectedAttemptCount: 1,
        occurredAt: new Date(),
        outcome: { kind: "failed", errorMessage: "boom" },
        chunks: [],
      });

      const stored = await documentRepository.findById({ organizationId, knowledgeDocumentId: document.id });
      expect(stored?.status).toBe("FAILED");
      const chunks = await chunkRepository.listByDocumentId({ organizationId, knowledgeDocumentId: document.id });
      expect(chunks).toHaveLength(0);
    });

    /** Correction audit Codex "Anomalie 2" — preuve réelle (Postgres) que `createForEntry` est une
     *  transaction unique : un libellé de tag oversized force une VRAIE violation de contrainte
     *  APRÈS que l'entrée, sa version et le KnowledgeDocument ont déjà été écrits dans la même
     *  transaction — tout doit être annulé ensemble, y compris pour une NOUVELLE entrée. */
    it("createForEntry rolls back the new entry, its version, AND the document when a late tag write violates a real DB constraint", async () => {
      const entry = KnowledgeEntry.create({
        id: randomUUID(),
        organizationId,
        knowledgeSpaceId: spaceId,
        title: "Entrée import vouée à échouer",
        category: KnowledgeCategory.Other,
        sourceType: KnowledgeSourceType.DocumentImport,
        metadata: {},
        createdByUserId: actorId,
        occurredAt: new Date(),
      });
      const version = KnowledgeEntryVersion.create({
        id: randomUUID(),
        organizationId,
        knowledgeEntryId: entry.id,
        versionNumber: 1,
        snapshot: { title: entry.title, category: entry.category, metadata: {} },
        createdByUserId: actorId,
        occurredAt: new Date(),
      });
      const document = KnowledgeDocument.create({ id: randomUUID(), organizationId, knowledgeEntryId: entry.id, documentId: storedDocumentId, versionNumber: 1, occurredAt: new Date() });
      const oversizedLabel = "y".repeat(61);

      await expect(
        documentRepository.createForEntry({
          isNewEntry: true,
          entry,
          entryVersion: version,
          document,
          tagLabels: [{ label: oversizedLabel, displayLabel: oversizedLabel }],
          occurredAt: new Date(),
          auditEntry: { organizationId, actorType: "USER", actorId, action: "knowledge_document.added", resourceType: "knowledge_entry", resourceId: entry.id },
        }),
      ).rejects.toThrow();

      expect(await entryRepository.findById({ organizationId, knowledgeEntryId: entry.id })).toBeNull();
      expect(await versionRepository.findByVersionNumber({ organizationId, knowledgeEntryId: entry.id, versionNumber: 1 })).toBeNull();
      expect(await documentRepository.findById({ organizationId, knowledgeDocumentId: document.id })).toBeNull();
      expect(await tagRepository.findByLabel({ organizationId, label: oversizedLabel })).toBeNull();
    });
  });

  describe("KnowledgeTagRepository", () => {
    it("findOrCreate reuses the same tag for a label differing only by case", async () => {
      const first = await tagRepository.findOrCreate({ organizationId, label: "cloud", displayLabel: "Cloud", occurredAt: new Date() });
      const second = await tagRepository.findOrCreate({ organizationId, label: "cloud", displayLabel: "CLOUD", occurredAt: new Date() });
      expect(second.id).toBe(first.id);
    });

    it("rejects a duplicate (organizationId, label) at the database level", async () => {
      await tagRepository.findOrCreate({ organizationId, label: "azure", displayLabel: "Azure", occurredAt: new Date() });
      await expect(
        prisma.knowledgeTag.create({ data: { id: randomUUID(), organizationId, label: "azure", displayLabel: "Azure (dup)", createdAt: new Date() } }),
      ).rejects.toThrow();
    });

    it("deleting a tag removes its entry associations but never the entry itself", async () => {
      const entryId = await createEntry();
      const tag = await tagRepository.findOrCreate({ organizationId, label: "kubernetes", displayLabel: "Kubernetes", occurredAt: new Date() });
      await tagRepository.attachToEntry({ organizationId, knowledgeEntryId: entryId, tagId: tag.id, occurredAt: new Date() });

      await tagRepository.delete({ organizationId, tagId: tag.id });

      const entry = await entryRepository.findById({ organizationId, knowledgeEntryId: entryId });
      expect(entry).not.toBeNull();
      const tags = await tagRepository.listByEntryId({ organizationId, knowledgeEntryId: entryId });
      expect(tags).toHaveLength(0);
    });
  });

  describe("PrismaIlikeKnowledgeSearchProvider", () => {
    it("finds a match by title and by chunk content, tenant-scoped", async () => {
      const entryId = await createEntry({ title: "Profil consultant DevOps unique-marker-title" });
      const document = KnowledgeDocument.create({ id: randomUUID(), organizationId, knowledgeEntryId: entryId, documentId: storedDocumentId, versionNumber: 1, occurredAt: new Date() });
      await documentRepository.create(document);
      await documentRepository.reserveForProcessing({ organizationId, knowledgeDocumentId: document.id, occurredAt: new Date() });
      await documentRepository.finalizeAttempt({
        organizationId,
        knowledgeDocumentId: document.id,
        expectedAttemptCount: 1,
        occurredAt: new Date(),
        outcome: { kind: "succeeded", language: "fr", warnings: [] },
        chunks: [{ sequence: 0, content: "Expert en unique-marker-content Kubernetes et Azure.", characterCount: 50, checksum: "chk" }],
      });

      const titleResult = await searchProvider.search({ organizationId, query: "unique-marker-title", includeArchived: false, limit: 20, offset: 0 });
      expect(titleResult.matches.some((match) => match.knowledgeEntryId === entryId && match.matchLocation === "TITLE")).toBe(true);

      const contentResult = await searchProvider.search({ organizationId, query: "unique-marker-content", includeArchived: false, limit: 20, offset: 0 });
      expect(contentResult.matches.some((match) => match.knowledgeEntryId === entryId && match.matchLocation === "CONTENT")).toBe(true);

      const crossTenantResult = await searchProvider.search({ organizationId: otherOrganizationId, query: "unique-marker-title", includeArchived: false, limit: 20, offset: 0 });
      expect(crossTenantResult.matches).toHaveLength(0);
    });

    /** Correction "Anomalie 1" (audit Codex) — la branche `metadataMatches` ne respectait
     *  auparavant que `organizationId`/`archivedAt` : une entrée hors catégorie/statut/tag/plage de
     *  dates demandée pouvait quand même remonter via ses métadonnées. Chaque test ci-dessous
     *  échouait avant la correction de `buildEntrySqlConditions` (prisma-ilike-knowledge-search.provider.ts). */
    describe("metadataMatches never bypasses the filters applied to the other branches", () => {
      async function insertRawEntry(overrides: {
        category?: string;
        status?: string;
        archivedAt?: Date | null;
        createdAt?: Date;
        metadata?: Record<string, unknown>;
        organizationId?: string;
      }): Promise<string> {
        const id = randomUUID();
        await prisma.knowledgeEntry.create({
          data: {
            id,
            organizationId: overrides.organizationId ?? organizationId,
            knowledgeSpaceId: overrides.organizationId === otherOrganizationId ? otherSpaceId : spaceId,
            title: "Entrée de test recherche metadata",
            category: overrides.category ?? KnowledgeCategory.Certification,
            sourceType: KnowledgeSourceType.Manual,
            status: overrides.status ?? "READY",
            metadata: (overrides.metadata ?? {}) as Prisma.InputJsonValue,
            activeVersionNumber: 1,
            createdByUserId: actorId,
            archivedAt: overrides.archivedAt ?? null,
            createdAt: overrides.createdAt ?? new Date(),
            updatedAt: overrides.createdAt ?? new Date(),
          },
        });
        return id;
      }

      it("never returns a metadata match outside the requested category", async () => {
        const entryId = await insertRawEntry({ category: KnowledgeCategory.Certification, metadata: { note: "metadata-only-marker-category" } });

        const wrongCategory = await searchProvider.search({
          organizationId,
          query: "metadata-only-marker-category",
          category: KnowledgeCategory.ClientReference,
          includeArchived: false,
          limit: 20,
          offset: 0,
        });
        expect(wrongCategory.matches.some((match) => match.knowledgeEntryId === entryId)).toBe(false);

        const rightCategory = await searchProvider.search({
          organizationId,
          query: "metadata-only-marker-category",
          category: KnowledgeCategory.Certification,
          includeArchived: false,
          limit: 20,
          offset: 0,
        });
        expect(rightCategory.matches.some((match) => match.knowledgeEntryId === entryId)).toBe(true);
      });

      it("never returns a metadata match outside the requested status", async () => {
        const entryId = await insertRawEntry({ status: "FAILED", metadata: { note: "metadata-only-marker-status" } });

        const wrongStatus = await searchProvider.search({ organizationId, query: "metadata-only-marker-status", status: "READY", includeArchived: false, limit: 20, offset: 0 });
        expect(wrongStatus.matches.some((match) => match.knowledgeEntryId === entryId)).toBe(false);

        const rightStatus = await searchProvider.search({ organizationId, query: "metadata-only-marker-status", status: "FAILED", includeArchived: false, limit: 20, offset: 0 });
        expect(rightStatus.matches.some((match) => match.knowledgeEntryId === entryId)).toBe(true);
      });

      it("never returns a metadata match for an entry that does not carry the requested tag", async () => {
        const entryId = await insertRawEntry({ metadata: { note: "metadata-only-marker-tag" } });
        const otherEntryId = await insertRawEntry({ metadata: { note: "metadata-only-marker-tag" } });
        const tag = await tagRepository.findOrCreate({ organizationId, label: "tag-recherche-metadata", displayLabel: "Tag recherche metadata", occurredAt: new Date() });
        await tagRepository.attachToEntry({ organizationId, knowledgeEntryId: entryId, tagId: tag.id, occurredAt: new Date() });

        const result = await searchProvider.search({ organizationId, query: "metadata-only-marker-tag", tagId: tag.id, includeArchived: false, limit: 20, offset: 0 });
        expect(result.matches.some((match) => match.knowledgeEntryId === entryId)).toBe(true);
        expect(result.matches.some((match) => match.knowledgeEntryId === otherEntryId)).toBe(false);
      });

      it("never returns a metadata match outside the requested date range", async () => {
        const entryId = await insertRawEntry({ createdAt: new Date("2020-01-01T00:00:00.000Z"), metadata: { note: "metadata-only-marker-dates" } });

        const outsideRange = await searchProvider.search({
          organizationId,
          query: "metadata-only-marker-dates",
          createdAfter: new Date("2021-01-01T00:00:00.000Z"),
          includeArchived: false,
          limit: 20,
          offset: 0,
        });
        expect(outsideRange.matches.some((match) => match.knowledgeEntryId === entryId)).toBe(false);

        const insideRange = await searchProvider.search({
          organizationId,
          query: "metadata-only-marker-dates",
          createdBefore: new Date("2021-01-01T00:00:00.000Z"),
          includeArchived: false,
          limit: 20,
          offset: 0,
        });
        expect(insideRange.matches.some((match) => match.knowledgeEntryId === entryId)).toBe(true);
      });

      it("never returns an archived entry's metadata match unless includeArchived is true", async () => {
        const entryId = await insertRawEntry({ archivedAt: new Date(), metadata: { note: "metadata-only-marker-archive" } });

        const excluded = await searchProvider.search({ organizationId, query: "metadata-only-marker-archive", includeArchived: false, limit: 20, offset: 0 });
        expect(excluded.matches.some((match) => match.knowledgeEntryId === entryId)).toBe(false);

        const included = await searchProvider.search({ organizationId, query: "metadata-only-marker-archive", includeArchived: true, limit: 20, offset: 0 });
        expect(included.matches.some((match) => match.knowledgeEntryId === entryId)).toBe(true);
      });

      it("never returns a metadata match belonging to another organization", async () => {
        const entryId = await insertRawEntry({ organizationId: otherOrganizationId, metadata: { note: "metadata-only-marker-tenant" } });

        const result = await searchProvider.search({ organizationId, query: "metadata-only-marker-tenant", includeArchived: false, limit: 20, offset: 0 });
        expect(result.matches.some((match) => match.knowledgeEntryId === entryId)).toBe(false);
      });
    });
  });
});
