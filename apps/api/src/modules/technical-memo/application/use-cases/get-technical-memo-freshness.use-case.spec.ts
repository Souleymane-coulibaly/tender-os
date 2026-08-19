import { beforeEach, describe, expect, it, vi } from "vitest";
import { TechnicalMemoSectionRevisionSource, TechnicalMemoStatus, TechnicalMemoTemplateOrigin } from "../../domain/enums";
import { TechnicalMemo } from "../../domain/technical-memo.aggregate";
import { TechnicalMemoSection } from "../../domain/technical-memo-section.entity";
import { TechnicalMemoSectionRevision } from "../../domain/technical-memo-section-revision.entity";
import { InMemoryTechnicalMemoSectionRepository, InMemoryTechnicalMemoSectionRevisionRepository } from "../../test-support/fakes";
import { GetTechnicalMemoFreshnessUseCase } from "./get-technical-memo-freshness.use-case";

const ORG = "org-1";
const TENDER = "tender-1";
const OCCURRED_AT = new Date("2026-01-01T00:00:00.000Z");

const MEMO = TechnicalMemo.rehydrate({
  id: "memo-1",
  organizationId: ORG,
  tenderId: TENDER,
  clientAccountId: "client-1",
  templateOrigin: TechnicalMemoTemplateOrigin.TenderOsSystem,
  status: TechnicalMemoStatus.Draft,
  createdBy: "user-1",
  createdAt: OCCURRED_AT,
  updatedAt: OCCURRED_AT,
});

function section(id: string, order: number): TechnicalMemoSection {
  return TechnicalMemoSection.create({ id, organizationId: ORG, technicalMemoId: MEMO.id, sectionKey: `key-${id}`, title: `Section ${id}`, order, level: 1, createdBy: "user-1", occurredAt: OCCURRED_AT });
}

function revision(input: { id: string; sectionId: string; candidateCompanyId?: string | undefined; analysisVersion?: number | undefined }): TechnicalMemoSectionRevision {
  return TechnicalMemoSectionRevision.create({
    id: input.id,
    organizationId: ORG,
    technicalMemoSectionId: input.sectionId,
    revisionNumber: 1,
    source: TechnicalMemoSectionRevisionSource.AiGenerated,
    content: "Contenu.",
    candidateCompanyId: input.candidateCompanyId,
    analysisVersion: input.analysisVersion,
    createdBy: "user-1",
    occurredAt: OCCURRED_AT,
  });
}

describe("GetTechnicalMemoFreshnessUseCase (Checkpoint 2.1-P2.1-FIX-D)", () => {
  let sectionRepository: InMemoryTechnicalMemoSectionRepository;
  let revisionRepository: InMemoryTechnicalMemoSectionRevisionRepository;
  let accessService: { loadMemo: ReturnType<typeof vi.fn> };
  let getTenderUseCase: { execute: ReturnType<typeof vi.fn> };
  let getEffectiveTenderAnalysisSummaryUseCase: { execute: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    sectionRepository = new InMemoryTechnicalMemoSectionRepository();
    revisionRepository = new InMemoryTechnicalMemoSectionRevisionRepository();
    accessService = { loadMemo: vi.fn(async () => MEMO) };
    getTenderUseCase = { execute: vi.fn(async () => ({ candidateCompanyId: "candidate-alpha" })) };
    getEffectiveTenderAnalysisSummaryUseCase = { execute: vi.fn(async () => ({ analysisVersion: 3, dceRevision: 3, analysisFreshness: "CURRENT" })) };
  });

  function buildUseCase(): GetTechnicalMemoFreshnessUseCase {
    return new GetTechnicalMemoFreshnessUseCase(
      sectionRepository,
      revisionRepository,
      accessService as never,
      getTenderUseCase as never,
      getEffectiveTenderAnalysisSummaryUseCase as never,
    );
  }

  it("freshness=UNKNOWN when the memo has zero sections", async () => {
    const result = await buildUseCase().execute({ organizationId: ORG, technicalMemoId: MEMO.id, actorId: "user-1", actorRole: "BID_MANAGER" });
    expect(result.freshness).toBe("UNKNOWN");
  });

  // BLOQUANT (mission §29) — un mémoire avec une section jamais générée n'est JAMAIS globalement
  // CURRENT, même si toutes les autres sections sont parfaitement à jour.
  it("BLOQUANT — freshness=UNKNOWN (never CURRENT) when at least one section has never been generated", async () => {
    sectionRepository.sections.push(section("s1", 0), section("s2", 1));
    revisionRepository.revisions.push(revision({ id: "r1", sectionId: "s1", candidateCompanyId: "candidate-alpha" }));
    // s2 has no revision at all.

    const result = await buildUseCase().execute({ organizationId: ORG, technicalMemoId: MEMO.id, actorId: "user-1", actorRole: "BID_MANAGER" });

    expect(result.freshness).toBe("UNKNOWN");
    expect(result.sections.find((s) => s.technicalMemoSectionId === "s2")?.freshness).toBe("UNKNOWN");
  });

  it("freshness=CURRENT when every section is generated, candidate matches, and no section has a stale DCE dependency", async () => {
    sectionRepository.sections.push(section("s1", 0), section("s2", 1));
    revisionRepository.revisions.push(
      revision({ id: "r1", sectionId: "s1", candidateCompanyId: "candidate-alpha", analysisVersion: 3 }),
      revision({ id: "r2", sectionId: "s2", candidateCompanyId: "candidate-alpha" }), // no DCE dependency
    );

    const result = await buildUseCase().execute({ organizationId: ORG, technicalMemoId: MEMO.id, actorId: "user-1", actorRole: "BID_MANAGER" });

    expect(result.freshness).toBe("CURRENT");
    expect(getEffectiveTenderAnalysisSummaryUseCase.execute).toHaveBeenCalledTimes(1);
  });

  it("does not call GetEffectiveTenderAnalysisSummaryUseCase when no section has a DCE dependency (never a fabricated dependency)", async () => {
    sectionRepository.sections.push(section("s1", 0));
    revisionRepository.revisions.push(revision({ id: "r1", sectionId: "s1", candidateCompanyId: "candidate-alpha" }));

    await buildUseCase().execute({ organizationId: ORG, technicalMemoId: MEMO.id, actorId: "user-1", actorRole: "BID_MANAGER" });

    expect(getEffectiveTenderAnalysisSummaryUseCase.execute).not.toHaveBeenCalled();
  });

  // BLOQUANT (mission §10/§9) — le DCE a changé (analyse devenue STALE) : la section qui en
  // dépendait devient STALE, jamais un faux CURRENT global.
  it("BLOQUANT — freshness=STALE globally when a section's captured analysisVersion is no longer current", async () => {
    sectionRepository.sections.push(section("s1", 0));
    revisionRepository.revisions.push(revision({ id: "r1", sectionId: "s1", candidateCompanyId: "candidate-alpha", analysisVersion: 2 }));
    getEffectiveTenderAnalysisSummaryUseCase.execute = vi.fn(async () => ({ analysisVersion: 3, dceRevision: 3, analysisFreshness: "CURRENT" }));

    const result = await buildUseCase().execute({ organizationId: ORG, technicalMemoId: MEMO.id, actorId: "user-1", actorRole: "BID_MANAGER" });

    expect(result.freshness).toBe("STALE");
    expect(result.sections[0]?.analysisStale).toBe(true);
  });

  // BLOQUANT (mission §11) — changement de Candidate : STALE même si l'analyse elle-même est
  // CURRENT et la version inchangée.
  it("BLOQUANT — freshness=STALE when the Tender's candidate changed since generation, even if the analysis itself is CURRENT", async () => {
    sectionRepository.sections.push(section("s1", 0));
    revisionRepository.revisions.push(revision({ id: "r1", sectionId: "s1", candidateCompanyId: "candidate-alpha" }));
    getTenderUseCase.execute = vi.fn(async () => ({ candidateCompanyId: "candidate-beta" }));

    const result = await buildUseCase().execute({ organizationId: ORG, technicalMemoId: MEMO.id, actorId: "user-1", actorRole: "BID_MANAGER" });

    expect(result.freshness).toBe("STALE");
    expect(result.sections[0]?.candidateStale).toBe(true);
  });

  // TEST M20 (adapté) — une révision antérieure à ce checkpoint (`candidateCompanyId` jamais
  // capturé, `undefined`) sur un Tender qui a désormais une Candidate résolue n'est JAMAIS
  // silencieusement CURRENT : le mismatch `undefined !== "candidate-alpha"` la rend STALE — jamais
  // une provenance insuffisante interprétée comme "à jour par défaut".
  it("BLOQUANT (TEST M20) — a revision predating this checkpoint (no candidateCompanyId captured) is never silently CURRENT once the Tender has a resolved candidate", async () => {
    sectionRepository.sections.push(section("s1", 0));
    revisionRepository.revisions.push(revision({ id: "r1", sectionId: "s1", candidateCompanyId: undefined }));
    getTenderUseCase.execute = vi.fn(async () => ({ candidateCompanyId: "candidate-alpha" }));

    const result = await buildUseCase().execute({ organizationId: ORG, technicalMemoId: MEMO.id, actorId: "user-1", actorRole: "BID_MANAGER" });

    expect(result.freshness).toBe("STALE");
  });

  it("a memo whose Tender has no candidate at all (LEGACY FLOW) and no DCE dependency is CURRENT — never penalized for a legitimately absent candidate", async () => {
    sectionRepository.sections.push(section("s1", 0));
    revisionRepository.revisions.push(revision({ id: "r1", sectionId: "s1", candidateCompanyId: undefined }));
    getTenderUseCase.execute = vi.fn(async () => ({ candidateCompanyId: undefined }));

    const result = await buildUseCase().execute({ organizationId: ORG, technicalMemoId: MEMO.id, actorId: "user-1", actorRole: "BID_MANAGER" });

    expect(result.freshness).toBe("CURRENT");
  });
});
