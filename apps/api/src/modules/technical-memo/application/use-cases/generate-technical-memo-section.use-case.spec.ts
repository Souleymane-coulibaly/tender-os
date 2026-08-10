import { beforeEach, describe, expect, it, vi } from "vitest";
import { TechnicalMemoCoverageStatus, TechnicalMemoRequirementFindingType, TechnicalMemoSectionRevisionSource, TechnicalMemoSectionStatus, TechnicalMemoStatus, TechnicalMemoTemplateOrigin } from "../../domain/enums";
import { TechnicalMemo } from "../../domain/technical-memo.aggregate";
import { TechnicalMemoSection } from "../../domain/technical-memo-section.entity";
import { TechnicalMemoSectionRequirement } from "../../domain/technical-memo-section-requirement.entity";
import { TechnicalMemoSectionRevision } from "../../domain/technical-memo-section-revision.entity";
import {
  FakeAIProvider,
  FakeAIProviderRegistry,
  FakeAtomicTransactionRunner,
  fakeSectionAIProviderResult,
  FixedClock,
  InMemoryAuditLogWriter,
  InMemoryTechnicalMemoSectionRepository,
  InMemoryTechnicalMemoSectionRequirementRepository,
  InMemoryTechnicalMemoSectionRevisionRepository,
  SequentialIdGenerator,
} from "../../test-support/fakes";
import type { TechnicalMemoAccessService } from "../services/technical-memo-access.service";
import type { TechnicalMemoSectionContextAssembler } from "../services/technical-memo-section-context-assembler";
import { GenerateTechnicalMemoSectionUseCase } from "./generate-technical-memo-section.use-case";

const AI_CONFIG_FIXTURE = { aiModel: "gpt-4o-mini", aiTimeoutMs: 5000, aiMaxRetries: 1, aiRetryDelayMs: 1 };
const OCCURRED_AT = new Date("2026-01-01T00:00:00.000Z");

describe("GenerateTechnicalMemoSectionUseCase", () => {
  let sectionRepository: InMemoryTechnicalMemoSectionRepository;
  let revisionRepository: InMemoryTechnicalMemoSectionRevisionRepository;
  let requirementRepository: InMemoryTechnicalMemoSectionRequirementRepository;
  let accessService: { loadMemo: ReturnType<typeof vi.fn> };
  let contextAssembler: { assemble: ReturnType<typeof vi.fn> };
  let clock: FixedClock;

  const memo = TechnicalMemo.rehydrate({
    id: "memo-1",
    organizationId: "org-1",
    tenderId: "tender-1",
    clientAccountId: "client-1",
    templateOrigin: TechnicalMemoTemplateOrigin.TenderOsSystem,
    status: TechnicalMemoStatus.Draft,
    createdBy: "user-1",
    createdAt: OCCURRED_AT,
    updatedAt: OCCURRED_AT,
  });

  function buildUseCase(provider: FakeAIProvider): GenerateTechnicalMemoSectionUseCase {
    return new GenerateTechnicalMemoSectionUseCase(
      sectionRepository,
      revisionRepository,
      requirementRepository,
      new InMemoryAuditLogWriter(),
      new FakeAtomicTransactionRunner(),
      new FakeAIProviderRegistry(provider),
      AI_CONFIG_FIXTURE as never,
      clock,
      new SequentialIdGenerator(),
      accessService as unknown as TechnicalMemoAccessService,
      contextAssembler as unknown as TechnicalMemoSectionContextAssembler,
    );
  }

  beforeEach(() => {
    clock = new FixedClock();
    sectionRepository = new InMemoryTechnicalMemoSectionRepository();
    revisionRepository = new InMemoryTechnicalMemoSectionRevisionRepository();
    requirementRepository = new InMemoryTechnicalMemoSectionRequirementRepository();
    accessService = { loadMemo: vi.fn(async () => memo) };
    contextAssembler = {
      assemble: vi.fn(async () => ({
        sectionBlock: "Titre : Méthodologie",
        contextBlock: "## EXIGENCES DCE LIÉES\n- [FIND:REQUIREMENT:req-1] Exigence de méthodologie",
        knownReferences: new Map([["FIND:REQUIREMENT:req-1", { sourceType: "FINDING", findingType: TechnicalMemoRequirementFindingType.Requirement, findingId: "req-1", label: "Exigence 1", content: "Exigence de méthodologie" }]]),
      })),
    };
    sectionRepository.sections.push(
      TechnicalMemoSection.create({ id: "section-1", organizationId: "org-1", technicalMemoId: "memo-1", sectionKey: "0-methodologie", title: "Méthodologie", order: 0, level: 1, createdBy: "user-1", occurredAt: OCCURRED_AT }),
    );
    requirementRepository.links.push(
      TechnicalMemoSectionRequirement.create({ id: "link-1", organizationId: "org-1", technicalMemoSectionId: "section-1", findingType: TechnicalMemoRequirementFindingType.Requirement, findingId: "req-1", occurredAt: OCCURRED_AT }),
    );
  });

  it("completes the section with citations validated against the actually supplied context, and marks the linked requirement COVERED (evidence-based)", async () => {
    const provider = new FakeAIProvider([
      { kind: "success", result: fakeSectionAIProviderResult({ content: JSON.stringify({ content: "Notre méthodologie répond à l'exigence.", citations: [{ sourceRef: "FIND:REQUIREMENT:req-1" }], missingDataNotes: [] }) }) },
    ]);
    const useCase = buildUseCase(provider);

    const revision = await useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "BID_MANAGER", technicalMemoId: "memo-1", technicalMemoSectionId: "section-1" });

    expect(revision.source).toBe(TechnicalMemoSectionRevisionSource.AiGenerated);
    expect(revision.revisionNumber).toBe(1);
    expect(revision.content).toBe("Notre méthodologie répond à l'exigence.");
    expect(revision.citations).toHaveLength(1);

    const section = sectionRepository.sections.find((s) => s.id === "section-1")!;
    expect(section.status).toBe(TechnicalMemoSectionStatus.Draft);
    expect(section.content).toBe("Notre méthodologie répond à l'exigence.");

    // Mission §43-47 — la couverture est déduite des citations RÉELLES de cette révision, jamais
    // un score inventé.
    const link = requirementRepository.links.find((l) => l.id === "link-1")!;
    expect(link.coverageStatus).toBe(TechnicalMemoCoverageStatus.Covered);
    expect(link.confirmedByUser).toBe(false);
  });

  it("BLOQUANT — NEVER persists a forged citation (sourceRef not part of the supplied context) as a valid revision — fails the section instead", async () => {
    const provider = new FakeAIProvider([
      { kind: "success", result: fakeSectionAIProviderResult({ content: JSON.stringify({ content: "Texte avec source inventée.", citations: [{ sourceRef: "KB:forged-entry" }], missingDataNotes: [] }) }) },
    ]);
    const useCase = buildUseCase(provider);

    await expect(useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "BID_MANAGER", technicalMemoId: "memo-1", technicalMemoSectionId: "section-1" })).rejects.toThrow();

    expect(revisionRepository.revisions).toHaveLength(0);
    const section = sectionRepository.sections.find((s) => s.id === "section-1")!;
    expect(section.status).toBe(TechnicalMemoSectionStatus.Failed);
    expect(section.content).toBeUndefined();
    // La suggestion de couverture n'a jamais été appliquée — la génération a échoué avant.
    expect(requirementRepository.links.find((l) => l.id === "link-1")!.coverageStatus).toBe(TechnicalMemoCoverageStatus.NeedsReview);
  });

  it("degrades to NEEDS_REVIEW when the model reports missing data — never silently presented as complete", async () => {
    const provider = new FakeAIProvider([
      { kind: "success", result: fakeSectionAIProviderResult({ content: JSON.stringify({ content: "Texte partiel.", citations: [], missingDataNotes: ["Nombre d'ingénieurs mobilisés"] }) }) },
    ]);
    const useCase = buildUseCase(provider);

    const revision = await useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "BID_MANAGER", technicalMemoId: "memo-1", technicalMemoSectionId: "section-1" });

    expect(revision.missingDataNotes).toEqual(["Nombre d'ingénieurs mobilisés"]);
    const section = sectionRepository.sections.find((s) => s.id === "section-1")!;
    expect(section.status).toBe(TechnicalMemoSectionStatus.NeedsReview);

    // Le lien non cité par cette révision reste NEEDS_REVIEW — jamais NOT_COVERED tranché seul par l'IA.
    expect(requirementRepository.links.find((l) => l.id === "link-1")!.coverageStatus).toBe(TechnicalMemoCoverageStatus.NeedsReview);
  });

  it("a regeneration (revision #2) is sourced AI_REGENERATED and preserves the userInstruction", async () => {
    revisionRepository.revisions.push(
      TechnicalMemoSectionRevision.create({
        id: "rev-0",
        organizationId: "org-1",
        technicalMemoSectionId: "section-1",
        revisionNumber: 1,
        source: TechnicalMemoSectionRevisionSource.AiGenerated,
        content: "Première version.",
        createdBy: "user-1",
        occurredAt: OCCURRED_AT,
      }),
    );

    const provider = new FakeAIProvider([{ kind: "success", result: fakeSectionAIProviderResult({ content: JSON.stringify({ content: "Deuxième version, plus axée sécurité.", citations: [], missingDataNotes: [] }) }) }]);
    const useCase = buildUseCase(provider);

    const revision = await useCase.execute({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: "BID_MANAGER",
      technicalMemoId: "memo-1",
      technicalMemoSectionId: "section-1",
      userInstruction: "Insister davantage sur la sécurité",
    });

    expect(revision.revisionNumber).toBe(2);
    expect(revision.source).toBe(TechnicalMemoSectionRevisionSource.AiRegenerated);
    expect(revision.userInstruction).toBe("Insister davantage sur la sécurité");
  });

  it("BLOQUANT — a section belonging to a DIFFERENT technical memo is never generated (anti-IDOR)", async () => {
    const provider = new FakeAIProvider([]);
    const useCase = buildUseCase(provider);

    await expect(
      useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "BID_MANAGER", technicalMemoId: "some-other-memo", technicalMemoSectionId: "section-1" }),
    ).rejects.toThrow();
    expect(revisionRepository.revisions).toHaveLength(0);
  });
});
