import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { KnowledgeCategory } from "../../domain/knowledge-category";
import { KnowledgeEntry } from "../../domain/knowledge-entry.aggregate";
import { KnowledgeSourceType } from "../../domain/knowledge-source-type";
import type { KnowledgeSearchMatch } from "../ports/knowledge-search-provider";
import { SearchKnowledgeBaseUseCase } from "./search-knowledge-base.use-case";
import { FakeKnowledgeSearchProvider, InMemoryKnowledgeEntryRepository, InMemoryKnowledgeTagRepository } from "../../test-support/fakes";

const ORG = randomUUID();
const SPACE = randomUUID();
const ACTOR = randomUUID();
const NOW = new Date("2026-07-30T10:00:00Z");

describe("SearchKnowledgeBaseUseCase", () => {
  async function seedEntry(entryRepository: InMemoryKnowledgeEntryRepository, title: string): Promise<string> {
    const entry = KnowledgeEntry.create({
      id: randomUUID(),
      organizationId: ORG,
      knowledgeSpaceId: SPACE,
      title,
      category: KnowledgeCategory.ConsultantProfile,
      sourceType: KnowledgeSourceType.Manual,
      metadata: {},
      createdByUserId: ACTOR,
      occurredAt: NOW,
    });
    await entryRepository.create(entry);
    return entry.id;
  }

  it("enriches a raw match with the entry's title/category/tags — never a bare identifier", async () => {
    const entryRepository = new InMemoryKnowledgeEntryRepository();
    const entryId = await seedEntry(entryRepository, "CV de Jean Dupont");
    const tagRepository = new InMemoryKnowledgeTagRepository();
    const tag = await tagRepository.findOrCreate({ organizationId: ORG, label: "cloud", displayLabel: "Cloud", occurredAt: NOW });
    await tagRepository.attachToEntry({ organizationId: ORG, knowledgeEntryId: entryId, tagId: tag.id, occurredAt: NOW });

    const match: KnowledgeSearchMatch = { knowledgeEntryId: entryId, matchLocation: "CONTENT", snippet: "...expérience cloud...", chunkSequence: 0, knowledgeDocumentId: randomUUID() };
    const searchProvider = new FakeKnowledgeSearchProvider([match]);
    const useCase = new SearchKnowledgeBaseUseCase(searchProvider, entryRepository, tagRepository);

    const result = await useCase.execute({ organizationId: ORG, actorRole: "CONTRIBUTOR", query: "cloud", limit: 20, offset: 0 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.title).toBe("CV de Jean Dupont");
    expect(result.items[0]!.tags).toEqual(["Cloud"]);
    expect(result.items[0]!.snippet).toContain("cloud");
  });

  it("only fetches each distinct entry ONCE, even when multiple matches point to the same entry (avoid N+1)", async () => {
    const entryRepository = new InMemoryKnowledgeEntryRepository();
    const entryId = await seedEntry(entryRepository, "CV de Jean Dupont");
    const findByIdSpy = vi.spyOn(entryRepository, "findById");

    const matches: KnowledgeSearchMatch[] = [
      { knowledgeEntryId: entryId, matchLocation: "TITLE", snippet: "CV de Jean Dupont" },
      { knowledgeEntryId: entryId, matchLocation: "CONTENT", snippet: "...cloud..." },
      { knowledgeEntryId: entryId, matchLocation: "CONTENT", snippet: "...azure..." },
    ];
    const useCase = new SearchKnowledgeBaseUseCase(new FakeKnowledgeSearchProvider(matches), entryRepository, new InMemoryKnowledgeTagRepository());

    const result = await useCase.execute({ organizationId: ORG, actorRole: "CONTRIBUTOR", query: "cloud", limit: 20, offset: 0 });

    expect(result.items).toHaveLength(3);
    expect(findByIdSpy).toHaveBeenCalledTimes(1);
  });

  it("silently drops a match whose entry no longer exists — never a phantom result", async () => {
    const entryRepository = new InMemoryKnowledgeEntryRepository();
    const match: KnowledgeSearchMatch = { knowledgeEntryId: randomUUID(), matchLocation: "TITLE", snippet: "x" };
    const useCase = new SearchKnowledgeBaseUseCase(new FakeKnowledgeSearchProvider([match]), entryRepository, new InMemoryKnowledgeTagRepository());

    const result = await useCase.execute({ organizationId: ORG, actorRole: "CONTRIBUTOR", query: "x", limit: 20, offset: 0 });
    expect(result.items).toHaveLength(0);
  });

  it("rejects a role without Search permission", async () => {
    const entryRepository = new InMemoryKnowledgeEntryRepository();
    const useCase = new SearchKnowledgeBaseUseCase(new FakeKnowledgeSearchProvider([]), entryRepository, new InMemoryKnowledgeTagRepository());
    // Aucun rôle réel n'exclut Search parmi ceux définis (Viewer l'inclut) — un rôle totalement
    // inconnu est le seul cas qui la refuse (mission §"Un rôle inconnu ne doit recevoir aucun droit").
    await expect(useCase.execute({ organizationId: ORG, actorRole: "SOME_UNKNOWN_ROLE", query: "x", limit: 20, offset: 0 })).rejects.toThrow();
  });
});
