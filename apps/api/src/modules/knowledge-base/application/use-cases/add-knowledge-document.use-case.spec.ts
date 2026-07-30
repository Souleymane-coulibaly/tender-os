import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UuidGenerator } from "../../../../shared-kernel/id-generator";
import type { AssertClientAccessUseCase, GetClientAccountUseCase } from "../../../client-portfolio";
import type { CreateDocumentWithFirstVersionUseCase, InternalDocumentCleanupService } from "../../../documents";
import { KnowledgeEntry } from "../../domain/knowledge-entry.aggregate";
import { KnowledgeCategory } from "../../domain/knowledge-category";
import { KnowledgeSourceType } from "../../domain/knowledge-source-type";
import { AddKnowledgeDocumentUseCase } from "./add-knowledge-document.use-case";
import { GetOrCreateDefaultKnowledgeSpaceUseCase } from "./get-or-create-default-knowledge-space.use-case";
import {
  FixedClock,
  InMemoryAuditLogWriter,
  InMemoryKnowledgeChunkRepository,
  InMemoryKnowledgeDocumentRepository,
  InMemoryKnowledgeEntryRepository,
  InMemoryKnowledgeEntryVersionRepository,
  InMemoryKnowledgeSpaceRepository,
  InMemoryKnowledgeTagRepository,
  RecordingKnowledgeDispatcher,
} from "../../test-support/fakes";

const ORG = randomUUID();
const ACTOR = randomUUID();

const FAKE_FILE = { buffer: Buffer.from("fake-pdf-bytes"), originalFilename: "cv.pdf", mimeType: "application/pdf" };

// Aucun test ci-dessous ne fournit `clientAccountId` ni ne seed une entrée avec un client : les
// vérifications Client Portfolio restent derrière leurs gardes `if`, jamais déclenchées ici.
const UNUSED_GET_CLIENT_ACCOUNT_USE_CASE = {} as GetClientAccountUseCase;
const UNUSED_ASSERT_CLIENT_ACCESS_USE_CASE = {} as AssertClientAccessUseCase;

describe("AddKnowledgeDocumentUseCase", () => {
  let entryRepository: InMemoryKnowledgeEntryRepository;
  let versionRepository: InMemoryKnowledgeEntryVersionRepository;
  let tagRepository: InMemoryKnowledgeTagRepository;
  let chunkRepository: InMemoryKnowledgeChunkRepository;
  let documentRepository: InMemoryKnowledgeDocumentRepository;
  let auditLogWriter: InMemoryAuditLogWriter;
  let dispatcher: RecordingKnowledgeDispatcher;
  let createDocumentWithFirstVersionUseCase: { execute: ReturnType<typeof vi.fn> };
  let internalDocumentCleanupService: { purgeJustCreatedDocument: ReturnType<typeof vi.fn> };
  let useCase: AddKnowledgeDocumentUseCase;

  beforeEach(() => {
    versionRepository = new InMemoryKnowledgeEntryVersionRepository();
    tagRepository = new InMemoryKnowledgeTagRepository();
    auditLogWriter = new InMemoryAuditLogWriter();
    entryRepository = new InMemoryKnowledgeEntryRepository(versionRepository, tagRepository, auditLogWriter);
    chunkRepository = new InMemoryKnowledgeChunkRepository();
    documentRepository = new InMemoryKnowledgeDocumentRepository(chunkRepository, entryRepository, versionRepository, tagRepository, auditLogWriter);
    dispatcher = new RecordingKnowledgeDispatcher();
    createDocumentWithFirstVersionUseCase = { execute: vi.fn(async () => ({ id: randomUUID() })) };
    internalDocumentCleanupService = { purgeJustCreatedDocument: vi.fn(async () => undefined) };
    const spaceUseCase = new GetOrCreateDefaultKnowledgeSpaceUseCase(new InMemoryKnowledgeSpaceRepository(), new FixedClock(), new UuidGenerator());

    useCase = new AddKnowledgeDocumentUseCase(
      entryRepository,
      documentRepository,
      tagRepository,
      dispatcher,
      new FixedClock(),
      new UuidGenerator(),
      createDocumentWithFirstVersionUseCase as unknown as CreateDocumentWithFirstVersionUseCase,
      internalDocumentCleanupService as unknown as InternalDocumentCleanupService,
      spaceUseCase,
      UNUSED_GET_CLIENT_ACCOUNT_USE_CASE,
      UNUSED_ASSERT_CLIENT_ACCESS_USE_CASE,
    );
  });

  async function seedExistingEntry(): Promise<string> {
    const entry = KnowledgeEntry.create({
      id: randomUUID(),
      organizationId: ORG,
      knowledgeSpaceId: randomUUID(),
      title: "Profil consultant",
      category: KnowledgeCategory.ConsultantProfile,
      sourceType: KnowledgeSourceType.Manual,
      metadata: {},
      createdByUserId: ACTOR,
      occurredAt: new Date(),
    });
    await entryRepository.create(entry);
    return entry.id;
  }

  it("creates a new entry from an imported document, dispatches processing, records audit", async () => {
    const result = await useCase.execute({
      organizationId: ORG,
      actorId: ACTOR,
      actorRole: "CONTRIBUTOR",
      title: "CV importé",
      category: "CONSULTANT_PROFILE",
      file: FAKE_FILE,
      maxFileSizeBytes: 1_000_000,
    });

    expect(result.status).toBe("PROCESSING");
    expect(result.sourceType).toBe("DOCUMENT_IMPORT");
    expect(dispatcher.dispatched).toHaveLength(1);
    expect(auditLogWriter.entries.map((entry) => entry.action)).toContain("knowledge_document.added");

    const versions = await versionRepository.listByEntryId({ organizationId: ORG, knowledgeEntryId: result.id });
    expect(versions).toHaveLength(1);
  });

  it("adds a document to an existing entry, bumping its version and preserving its existing tags", async () => {
    const entryId = await seedExistingEntry();
    await tagRepository.attachToEntry({
      organizationId: ORG,
      knowledgeEntryId: entryId,
      tagId: (await tagRepository.findOrCreate({ organizationId: ORG, label: "cloud", displayLabel: "Cloud", occurredAt: new Date() })).id,
      occurredAt: new Date(),
    });

    const result = await useCase.execute({ organizationId: ORG, actorId: ACTOR, actorRole: "CONTRIBUTOR", knowledgeEntryId: entryId, file: FAKE_FILE, maxFileSizeBytes: 1_000_000 });

    expect(result.activeVersionNumber).toBe(2);
    expect(result.tags.map((tag) => tag.label)).toContain("cloud");
  });

  /** Correction audit Codex "Anomalie 2" — le stockage (module Documents) réussit, PUIS l'écriture
   *  atomique Knowledge (`createForEntry`) échoue : le Document physique fraîchement créé doit être
   *  purgé explicitement (compensation), et l'erreur d'origine doit rester prioritaire. */
  describe("atomicity — compensation when the Knowledge-side transaction fails after storage succeeded", () => {
    it("purges the just-created Document and rethrows the original error", async () => {
      documentRepository.failNextCreateForEntry = true;

      await expect(
        useCase.execute({ organizationId: ORG, actorId: ACTOR, actorRole: "CONTRIBUTOR", title: "Voué à échouer", category: "OTHER", file: FAKE_FILE, maxFileSizeBytes: 1_000_000 }),
      ).rejects.toThrow("Simulated KnowledgeDocument persistence failure");

      expect(internalDocumentCleanupService.purgeJustCreatedDocument).toHaveBeenCalledTimes(1);
    });

    it("leaves no residual entry, version, KnowledgeDocument, or dispatch after the injected failure", async () => {
      documentRepository.failNextCreateForEntry = true;

      await expect(
        useCase.execute({ organizationId: ORG, actorId: ACTOR, actorRole: "CONTRIBUTOR", title: "Voué à échouer", category: "OTHER", file: FAKE_FILE, maxFileSizeBytes: 1_000_000 }),
      ).rejects.toThrow();

      const page = await entryRepository.list({ organizationId: ORG, includeArchived: true, limit: 10 });
      expect(page.items).toHaveLength(0);
      expect(dispatcher.dispatched).toHaveLength(0);
      expect(auditLogWriter.entries).toHaveLength(0);
    });

    it("still throws the original error even if the compensation itself fails", async () => {
      documentRepository.failNextCreateForEntry = true;
      internalDocumentCleanupService.purgeJustCreatedDocument.mockRejectedValueOnce(new Error("cleanup also failed"));

      await expect(
        useCase.execute({ organizationId: ORG, actorId: ACTOR, actorRole: "CONTRIBUTOR", title: "Voué à échouer", category: "OTHER", file: FAKE_FILE, maxFileSizeBytes: 1_000_000 }),
      ).rejects.toThrow("Simulated KnowledgeDocument persistence failure");
    });

    it("never calls compensation when the whole operation succeeds", async () => {
      await useCase.execute({ organizationId: ORG, actorId: ACTOR, actorRole: "CONTRIBUTOR", title: "OK", category: "OTHER", file: FAKE_FILE, maxFileSizeBytes: 1_000_000 });
      expect(internalDocumentCleanupService.purgeJustCreatedDocument).not.toHaveBeenCalled();
    });

    it("recovers cleanly on the next attempt after a failed one (the failure flag is single-use)", async () => {
      documentRepository.failNextCreateForEntry = true;
      await expect(
        useCase.execute({ organizationId: ORG, actorId: ACTOR, actorRole: "CONTRIBUTOR", title: "Échec", category: "OTHER", file: FAKE_FILE, maxFileSizeBytes: 1_000_000 }),
      ).rejects.toThrow();

      const result = await useCase.execute({ organizationId: ORG, actorId: ACTOR, actorRole: "CONTRIBUTOR", title: "Succès", category: "OTHER", file: FAKE_FILE, maxFileSizeBytes: 1_000_000 });
      expect(result.status).toBe("PROCESSING");
    });
  });
});
