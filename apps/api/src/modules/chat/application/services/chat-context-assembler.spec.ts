import { beforeEach, describe, expect, it, vi } from "vitest";
import { GoNoGoReportNotFoundError } from "../../../opportunity";
import { TenderBusinessAnalysisNotFoundError } from "../../../analysis";
import { KnowledgeEntryNotFoundError, KnowledgeEntryVersionNotFoundError } from "../../../knowledge-base";
import { FakeDceChunkSearchProvider } from "../../test-support/fakes";
import { ChatContextAssembler } from "./chat-context-assembler";

/** Fake minimal — `listByTender` toujours vide, suffisant pour ces tests centrés sur le
 *  comportement Knowledge Base (mission — "il ne récupère jamais une connaissance non validée ou
 *  d'une autre entreprise candidate"). */
function emptyRepository() {
  return { listByTender: vi.fn(async () => []) };
}

describe("ChatContextAssembler — Knowledge Base scope (non-negotiable rule)", () => {
  let searchKnowledgeBaseUseCase: { execute: ReturnType<typeof vi.fn> };
  let getKnowledgeVersionUseCase: { execute: ReturnType<typeof vi.fn> };
  let assembler: ChatContextAssembler;

  beforeEach(() => {
    searchKnowledgeBaseUseCase = { execute: vi.fn(async () => ({ items: [], total: 0 })) };
    getKnowledgeVersionUseCase = { execute: vi.fn(async (query: { versionNumber: number }) => ({ id: `version-${query.versionNumber}` })) };

    const emptyFindings = { execute: vi.fn(async () => ({ items: [], total: 0, limit: 50, offset: 0 })) };
    const getEffectiveTenderAnalysisSummaryUseCase = { execute: vi.fn(async () => { throw new TenderBusinessAnalysisNotFoundError(); }) };
    const getGoNoGoReportUseCase = { execute: vi.fn(async () => { throw new GoNoGoReportNotFoundError(); }) };

    assembler = new ChatContextAssembler(
      emptyRepository() as never,
      emptyRepository() as never,
      emptyRepository() as never,
      emptyRepository() as never,
      emptyRepository() as never,
      emptyRepository() as never,
      getEffectiveTenderAnalysisSummaryUseCase as never,
      emptyFindings as never,
      emptyFindings as never,
      emptyFindings as never,
      emptyFindings as never,
      emptyFindings as never,
      emptyFindings as never,
      getGoNoGoReportUseCase as never,
      new FakeDceChunkSearchProvider(),
      searchKnowledgeBaseUseCase as never,
      getKnowledgeVersionUseCase as never,
    );
  });

  it("ALWAYS forces validatedOnly:true, never controllable by the caller (mission — 'jamais une connaissance non validée')", async () => {
    await assembler.assemble({ organizationId: "org-1", tenderId: "tender-1", actorId: "user-1", actorRole: "BID_MANAGER", tender: { id: "tender-1", clientAccountId: "client-1" } as never, question: "Nos certifications ?" });

    expect(searchKnowledgeBaseUseCase.execute).toHaveBeenCalledTimes(2);
    for (const call of searchKnowledgeBaseUseCase.execute.mock.calls) {
      expect(call[0]).toMatchObject({ validatedOnly: true });
    }
  });

  it("queries ONLY this Tender's own client (never another accessible client) AND global knowledge — never an unrestricted cross-client query", async () => {
    await assembler.assemble({ organizationId: "org-1", tenderId: "tender-1", actorId: "user-1", actorRole: "BID_MANAGER", tender: { id: "tender-1", clientAccountId: "client-1" } as never, question: "Nos certifications ?" });

    const clientAccountIdsQueried = searchKnowledgeBaseUseCase.execute.mock.calls.map((call: unknown[]) => (call[0] as { clientAccountId: unknown }).clientAccountId);
    expect(clientAccountIdsQueried.sort()).toEqual(["GLOBAL", "client-1"]);
  });

  it("de-duplicates entries returned by both the client-scoped and global searches", async () => {
    searchKnowledgeBaseUseCase.execute
      .mockResolvedValueOnce({ items: [{ knowledgeEntryId: "kb-1", title: "Certification ISO 9001", snippet: "...", activeVersionNumber: 3 }], total: 1 })
      .mockResolvedValueOnce({ items: [{ knowledgeEntryId: "kb-1", title: "Certification ISO 9001", snippet: "...", activeVersionNumber: 3 }], total: 1 });

    const context = await assembler.assemble({ organizationId: "org-1", tenderId: "tender-1", actorId: "user-1", actorRole: "BID_MANAGER", tender: { id: "tender-1", clientAccountId: "client-1" } as never, question: "Nos certifications ?" });

    const knowledgeRefs = [...context.knownReferences.keys()].filter((ref) => ref.startsWith("KB:"));
    expect(knowledgeRefs).toEqual(["KB:kb-1"]);
  });

  it("correctif audit Codex P1 — resolves and attaches the REAL knowledgeEntryVersionId (never just the entry) to every KNOWLEDGE_ENTRY citation", async () => {
    searchKnowledgeBaseUseCase.execute
      .mockResolvedValueOnce({ items: [{ knowledgeEntryId: "kb-1", title: "Certification ISO 9001", snippet: "...", activeVersionNumber: 3 }], total: 1 })
      .mockResolvedValueOnce({ items: [], total: 0 });

    const context = await assembler.assemble({ organizationId: "org-1", tenderId: "tender-1", actorId: "user-1", actorRole: "BID_MANAGER", tender: { id: "tender-1", clientAccountId: "client-1" } as never, question: "Nos certifications ?" });

    expect(getKnowledgeVersionUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({ knowledgeEntryId: "kb-1", versionNumber: 3 }));
    expect(context.knownReferences.get("KB:kb-1")?.knowledgeEntryVersionId).toBe("version-3");
  });

  it("correctif audit Codex round 2 P1 — NEVER registers a KNOWLEDGE_ENTRY citation without a real, verified version id: excludes the entry entirely when the version lookup races (version/entry disappeared between search and resolution), rather than tolerating an undefined version on a real citation", async () => {
    searchKnowledgeBaseUseCase.execute
      .mockResolvedValueOnce({ items: [{ knowledgeEntryId: "kb-1", title: "Certification ISO 9001", snippet: "...", activeVersionNumber: 3 }], total: 1 })
      .mockResolvedValueOnce({ items: [], total: 0 });
    getKnowledgeVersionUseCase.execute.mockRejectedValueOnce(new KnowledgeEntryVersionNotFoundError());

    const context = await assembler.assemble({ organizationId: "org-1", tenderId: "tender-1", actorId: "user-1", actorRole: "BID_MANAGER", tender: { id: "tender-1", clientAccountId: "client-1" } as never, question: "Nos certifications ?" });

    // Ni citée sans version, ni une erreur bloquante pour tout le tour de Chat — simplement absente.
    expect(context.knownReferences.has("KB:kb-1")).toBe(false);
    expect(context.contextBlock).not.toContain("Certification ISO 9001");
  });

  it("also excludes the entry when the entry itself (not just the version) has disappeared by the time of resolution (KnowledgeEntryNotFoundError)", async () => {
    searchKnowledgeBaseUseCase.execute
      .mockResolvedValueOnce({ items: [{ knowledgeEntryId: "kb-1", title: "Certification ISO 9001", snippet: "...", activeVersionNumber: 3 }], total: 1 })
      .mockResolvedValueOnce({ items: [], total: 0 });
    getKnowledgeVersionUseCase.execute.mockRejectedValueOnce(new KnowledgeEntryNotFoundError());

    const context = await assembler.assemble({ organizationId: "org-1", tenderId: "tender-1", actorId: "user-1", actorRole: "BID_MANAGER", tender: { id: "tender-1", clientAccountId: "client-1" } as never, question: "Nos certifications ?" });

    expect(context.knownReferences.has("KB:kb-1")).toBe(false);
  });
});
