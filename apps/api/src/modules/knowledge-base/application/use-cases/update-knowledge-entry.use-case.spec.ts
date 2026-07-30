import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { UuidGenerator } from "../../../../shared-kernel/id-generator";
import { KnowledgeCategory } from "../../domain/knowledge-category";
import { KnowledgeEntry } from "../../domain/knowledge-entry.aggregate";
import { KnowledgeEntryArchivedError, KnowledgeEntryNotFoundError } from "../../domain/errors";
import { KnowledgeSourceType } from "../../domain/knowledge-source-type";
import { UpdateKnowledgeEntryUseCase } from "./update-knowledge-entry.use-case";
import {
  FixedClock,
  InMemoryAuditLogWriter,
  InMemoryKnowledgeDocumentRepository,
  InMemoryKnowledgeEntryRepository,
  InMemoryKnowledgeEntryVersionRepository,
  InMemoryKnowledgeTagRepository,
} from "../../test-support/fakes";

const ORG = randomUUID();
const SPACE = randomUUID();
const ACTOR = randomUUID();
const NOW = new Date("2026-07-30T10:00:00Z");

describe("UpdateKnowledgeEntryUseCase", () => {
  let entryRepository: InMemoryKnowledgeEntryRepository;
  let versionRepository: InMemoryKnowledgeEntryVersionRepository;
  let useCase: UpdateKnowledgeEntryUseCase;

  beforeEach(() => {
    entryRepository = new InMemoryKnowledgeEntryRepository();
    versionRepository = new InMemoryKnowledgeEntryVersionRepository();
    useCase = new UpdateKnowledgeEntryUseCase(
      entryRepository,
      versionRepository,
      new InMemoryKnowledgeTagRepository(),
      new InMemoryKnowledgeDocumentRepository(),
      new InMemoryAuditLogWriter(),
      new FixedClock(),
      new UuidGenerator(),
    );
  });

  async function seedEntry(): Promise<string> {
    const entry = KnowledgeEntry.create({
      id: randomUUID(),
      organizationId: ORG,
      knowledgeSpaceId: SPACE,
      title: "Titre initial",
      category: KnowledgeCategory.ClientReference,
      sourceType: KnowledgeSourceType.Manual,
      metadata: {},
      createdByUserId: ACTOR,
      occurredAt: NOW,
    });
    await entryRepository.create(entry);
    return entry.id;
  }

  it("updates the title/metadata and creates exactly ONE new version for the whole call", async () => {
    const entryId = await seedEntry();

    const result = await useCase.execute({
      organizationId: ORG,
      knowledgeEntryId: entryId,
      actorId: ACTOR,
      actorRole: "CONTRIBUTOR",
      title: "Titre corrigé",
      description: "Nouvelle description",
      metadata: { clientName: "Acme" },
    });

    expect(result.title).toBe("Titre corrigé");
    expect(result.activeVersionNumber).toBe(2);

    const versions = await versionRepository.listByEntryId({ organizationId: ORG, knowledgeEntryId: entryId });
    expect(versions).toHaveLength(1);
    expect(versions[0]!.versionNumber).toBe(2);
  });

  it("validates the new metadata against the (possibly new) category", async () => {
    const entryId = await seedEntry();
    await expect(
      useCase.execute({ organizationId: ORG, knowledgeEntryId: entryId, actorId: ACTOR, actorRole: "CONTRIBUTOR", metadata: { currency: "TOO_LONG" } }),
    ).rejects.toThrow();
  });

  it("refuses to update an archived entry", async () => {
    const entryId = await seedEntry();
    const entry = await entryRepository.findById({ organizationId: ORG, knowledgeEntryId: entryId });
    entry!.archive(NOW);
    await entryRepository.save(entry!);

    await expect(useCase.execute({ organizationId: ORG, knowledgeEntryId: entryId, actorId: ACTOR, actorRole: "CONTRIBUTOR", title: "x" })).rejects.toBeInstanceOf(
      KnowledgeEntryArchivedError,
    );
  });

  it("throws KnowledgeEntryNotFoundError for a non-existent entry", async () => {
    await expect(
      useCase.execute({ organizationId: ORG, knowledgeEntryId: randomUUID(), actorId: ACTOR, actorRole: "CONTRIBUTOR", title: "x" }),
    ).rejects.toBeInstanceOf(KnowledgeEntryNotFoundError);
  });

  it("never returns/updates an entry belonging to another organization", async () => {
    const entryId = await seedEntry();
    await expect(
      useCase.execute({ organizationId: randomUUID(), knowledgeEntryId: entryId, actorId: ACTOR, actorRole: "CONTRIBUTOR", title: "x" }),
    ).rejects.toBeInstanceOf(KnowledgeEntryNotFoundError);
  });
});
