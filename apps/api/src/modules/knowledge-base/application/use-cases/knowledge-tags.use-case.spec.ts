import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { KnowledgeCategory } from "../../domain/knowledge-category";
import { KnowledgeEntry } from "../../domain/knowledge-entry.aggregate";
import { KnowledgeSourceType } from "../../domain/knowledge-source-type";
import { AddKnowledgeTagUseCase } from "./add-knowledge-tag.use-case";
import { RemoveKnowledgeTagUseCase } from "./remove-knowledge-tag.use-case";
import { FixedClock, InMemoryAuditLogWriter, InMemoryKnowledgeEntryRepository, InMemoryKnowledgeTagRepository } from "../../test-support/fakes";

const ORG = randomUUID();
const SPACE = randomUUID();
const ACTOR = randomUUID();
const NOW = new Date("2026-07-30T10:00:00Z");

describe("AddKnowledgeTagUseCase / RemoveKnowledgeTagUseCase", () => {
  let entryRepository: InMemoryKnowledgeEntryRepository;
  let tagRepository: InMemoryKnowledgeTagRepository;
  let addUseCase: AddKnowledgeTagUseCase;
  let removeUseCase: RemoveKnowledgeTagUseCase;

  beforeEach(() => {
    entryRepository = new InMemoryKnowledgeEntryRepository();
    tagRepository = new InMemoryKnowledgeTagRepository();
    addUseCase = new AddKnowledgeTagUseCase(entryRepository, tagRepository, new InMemoryAuditLogWriter(), new FixedClock());
    removeUseCase = new RemoveKnowledgeTagUseCase(entryRepository, tagRepository, new InMemoryAuditLogWriter());
  });

  async function seedEntry(): Promise<string> {
    const entry = KnowledgeEntry.create({
      id: randomUUID(),
      organizationId: ORG,
      knowledgeSpaceId: SPACE,
      title: "Entrée",
      category: KnowledgeCategory.Other,
      sourceType: KnowledgeSourceType.Manual,
      metadata: {},
      createdByUserId: ACTOR,
      occurredAt: NOW,
    });
    await entryRepository.create(entry);
    return entry.id;
  }

  it("adding a tag NEVER bumps the entry's activeVersionNumber (mission: avoid heavy versions for minor tag changes)", async () => {
    const entryId = await seedEntry();
    await addUseCase.execute({ organizationId: ORG, knowledgeEntryId: entryId, actorId: ACTOR, actorRole: "CONTRIBUTOR", label: "cloud" });

    const entry = await entryRepository.findById({ organizationId: ORG, knowledgeEntryId: entryId });
    expect(entry!.activeVersionNumber).toBe(1);
  });

  it("reuses the same tag id for two labels that only differ by case", async () => {
    const entryId = await seedEntry();
    const first = await addUseCase.execute({ organizationId: ORG, knowledgeEntryId: entryId, actorId: ACTOR, actorRole: "CONTRIBUTOR", label: "Cloud" });
    const second = await addUseCase.execute({ organizationId: ORG, knowledgeEntryId: entryId, actorId: ACTOR, actorRole: "CONTRIBUTOR", label: "CLOUD" });
    expect(second.id).toBe(first.id);

    const tags = await tagRepository.listByEntryId({ organizationId: ORG, knowledgeEntryId: entryId });
    expect(tags).toHaveLength(1);
  });

  it("removing a tag never bumps the version either, and never deletes the tag globally", async () => {
    const entryId = await seedEntry();
    const tag = await addUseCase.execute({ organizationId: ORG, knowledgeEntryId: entryId, actorId: ACTOR, actorRole: "CONTRIBUTOR", label: "cloud" });

    await removeUseCase.execute({ organizationId: ORG, knowledgeEntryId: entryId, tagId: tag.id, actorId: ACTOR, actorRole: "CONTRIBUTOR" });

    const entry = await entryRepository.findById({ organizationId: ORG, knowledgeEntryId: entryId });
    expect(entry!.activeVersionNumber).toBe(1);
    const entryTags = await tagRepository.listByEntryId({ organizationId: ORG, knowledgeEntryId: entryId });
    expect(entryTags).toHaveLength(0);
    const stillExists = await tagRepository.findById({ organizationId: ORG, tagId: tag.id });
    expect(stillExists).not.toBeNull();
  });
});
