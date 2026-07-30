import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtractDocumentContentUseCase } from "../../../extraction";
import { KnowledgeCategory } from "../../domain/knowledge-category";
import { KnowledgeDocument } from "../../domain/knowledge-document.entity";
import { KnowledgeEntry } from "../../domain/knowledge-entry.aggregate";
import { KnowledgeSourceType } from "../../domain/knowledge-source-type";
import { ProcessKnowledgeDocumentUseCase } from "./process-knowledge-document.use-case";
import {
  FixedClock,
  InMemoryAuditLogWriter,
  InMemoryKnowledgeChunkRepository,
  InMemoryKnowledgeDocumentRepository,
  InMemoryKnowledgeEntryRepository,
} from "../../test-support/fakes";

const ORG = randomUUID();
const SPACE = randomUUID();
const ACTOR = randomUUID();
const DOC_ID = randomUUID();
const NOW = new Date("2026-07-30T10:00:00Z");

describe("ProcessKnowledgeDocumentUseCase", () => {
  let entryRepository: InMemoryKnowledgeEntryRepository;
  let chunkRepository: InMemoryKnowledgeChunkRepository;
  let documentRepository: InMemoryKnowledgeDocumentRepository;
  let auditLogWriter: InMemoryAuditLogWriter;

  beforeEach(() => {
    entryRepository = new InMemoryKnowledgeEntryRepository();
    chunkRepository = new InMemoryKnowledgeChunkRepository();
    documentRepository = new InMemoryKnowledgeDocumentRepository(chunkRepository, entryRepository);
    auditLogWriter = new InMemoryAuditLogWriter();
  });

  async function seedEntryAndDocument(): Promise<{ entryId: string; knowledgeDocumentId: string }> {
    const entry = KnowledgeEntry.create({
      id: randomUUID(),
      organizationId: ORG,
      knowledgeSpaceId: SPACE,
      title: "CV",
      category: KnowledgeCategory.ConsultantProfile,
      sourceType: KnowledgeSourceType.DocumentImport,
      metadata: {},
      createdByUserId: ACTOR,
      occurredAt: NOW,
    });
    entry.beginInitialProcessing(NOW);
    await entryRepository.create(entry);

    const document = KnowledgeDocument.create({ id: randomUUID(), organizationId: ORG, knowledgeEntryId: entry.id, documentId: DOC_ID, versionNumber: 1, occurredAt: NOW });
    await documentRepository.create(document);

    return { entryId: entry.id, knowledgeDocumentId: document.id };
  }

  function buildUseCase(extractResult: unknown): ProcessKnowledgeDocumentUseCase {
    const extractUseCase = { execute: vi.fn(async () => extractResult) } as unknown as ExtractDocumentContentUseCase;
    return new ProcessKnowledgeDocumentUseCase(documentRepository, auditLogWriter, new FixedClock(), extractUseCase);
  }

  it("on success: persists chunks, marks the document READY, and transitions the entry to READY — atomically", async () => {
    const { entryId, knowledgeDocumentId } = await seedEntryAndDocument();
    const useCase = buildUseCase({
      kind: "succeeded",
      language: "fr",
      warnings: [],
      chunks: [{ sequence: 0, content: "Jean Dupont, consultant cloud.", characterCount: 30, checksum: "chk-0" }],
    });

    await useCase.execute({ organizationId: ORG, knowledgeDocumentId });

    const document = await documentRepository.findById({ organizationId: ORG, knowledgeDocumentId });
    expect(document!.status).toBe("READY");
    expect(document!.language).toBe("fr");

    const chunks = await chunkRepository.listByDocumentId({ organizationId: ORG, knowledgeDocumentId });
    expect(chunks).toHaveLength(1);

    const entry = await entryRepository.findById({ organizationId: ORG, knowledgeEntryId: entryId });
    expect(entry!.status).toBe("READY");
  });

  it("on a failed extraction: marks the document FAILED and the entry FAILED, persists no chunks", async () => {
    const { entryId, knowledgeDocumentId } = await seedEntryAndDocument();
    const useCase = buildUseCase({ kind: "failed", reason: "extraction produced no usable text content" });

    await useCase.execute({ organizationId: ORG, knowledgeDocumentId });

    const document = await documentRepository.findById({ organizationId: ORG, knowledgeDocumentId });
    expect(document!.status).toBe("FAILED");
    expect(document!.errorMessage).toBe("extraction produced no usable text content");

    const entry = await entryRepository.findById({ organizationId: ORG, knowledgeEntryId: entryId });
    expect(entry!.status).toBe("FAILED");

    const chunks = await chunkRepository.listByDocumentId({ organizationId: ORG, knowledgeDocumentId });
    expect(chunks).toHaveLength(0);
  });

  it("treats not_processable (unsupported format) as a failure, never a silent success", async () => {
    const { knowledgeDocumentId } = await seedEntryAndDocument();
    const useCase = buildUseCase({ kind: "not_processable" });

    await useCase.execute({ organizationId: ORG, knowledgeDocumentId });

    const document = await documentRepository.findById({ organizationId: ORG, knowledgeDocumentId });
    expect(document!.status).toBe("FAILED");
  });

  it("skips (no-op) a document that is already PROCESSING — never calls extraction, never double-processes it", async () => {
    const { knowledgeDocumentId } = await seedEntryAndDocument();
    const inFlight = await documentRepository.findById({ organizationId: ORG, knowledgeDocumentId });
    inFlight!.reserve(NOW); // simule une réservation déjà en cours (dispatch concurrent)
    await documentRepository.create(inFlight!);

    const extractUseCase = { execute: vi.fn() } as unknown as ExtractDocumentContentUseCase;
    const useCase = new ProcessKnowledgeDocumentUseCase(documentRepository, auditLogWriter, new FixedClock(), extractUseCase);
    await useCase.execute({ organizationId: ORG, knowledgeDocumentId });

    expect(extractUseCase.execute).not.toHaveBeenCalled();
  });

  it("records an audit log entry with SYSTEM actorType", async () => {
    const { knowledgeDocumentId } = await seedEntryAndDocument();
    const useCase = buildUseCase({ kind: "succeeded", language: "fr", warnings: [], chunks: [] });
    await useCase.execute({ organizationId: ORG, knowledgeDocumentId });

    expect(auditLogWriter.entries.some((entry) => entry.actorType === "SYSTEM" && entry.action === "knowledge_document.processing_completed")).toBe(true);
  });
});
