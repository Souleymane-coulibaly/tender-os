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
  FakeRoutingPolicyResolver,
  fakeSectionAIProviderResult,
  FixedClock,
  InMemoryAuditLogWriter,
  InMemoryTechnicalMemoSectionRepository,
  InMemoryTechnicalMemoSectionRequirementRepository,
  InMemoryTechnicalMemoSectionRevisionRepository,
  RecordingRoutingDecisionWriter,
  SequentialIdGenerator,
  ThrowingRoutingDecisionWriter,
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
  let getEffectiveTenderAnalysisSummaryUseCase: { execute: ReturnType<typeof vi.fn> };
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

  function fakeEntitlementService(allowed = true) {
    return {
      canOperateOnTender: vi.fn(async () => allowed),
      runTenderOperationEntitled: vi.fn(async (_input: unknown, operation: () => Promise<unknown>) => {
        if (!allowed) {
          throw Object.assign(new Error("not entitled"), { code: "TENDER_OPERATION_NOT_ENTITLED" });
        }
        return operation();
      }),
    };
  }

  function buildUseCase(
    provider: FakeAIProvider,
    routingPolicyResolver?: FakeRoutingPolicyResolver,
    routingDecisionWriter?: RecordingRoutingDecisionWriter | ThrowingRoutingDecisionWriter,
    entitlementService?: ReturnType<typeof fakeEntitlementService>,
  ): GenerateTechnicalMemoSectionUseCase {
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
      getEffectiveTenderAnalysisSummaryUseCase as never,
      routingPolicyResolver as never,
      routingDecisionWriter as never,
      (entitlementService ?? fakeEntitlementService()) as never,
    );
  }

  beforeEach(() => {
    clock = new FixedClock();
    sectionRepository = new InMemoryTechnicalMemoSectionRepository();
    revisionRepository = new InMemoryTechnicalMemoSectionRevisionRepository();
    requirementRepository = new InMemoryTechnicalMemoSectionRequirementRepository();
    accessService = { loadMemo: vi.fn(async () => memo) };
    // Checkpoint 2.1-P2.1-FIX-D — le `beforeEach` ci-dessous lie TOUJOURS "section-1" à un
    // Finding DCE (`link-1`) : la précondition de fraîcheur (`assertAnalysisPrecondition`) est donc
    // TOUJOURS évaluée. CURRENT par défaut — les tests qui exercent spécifiquement le blocage
    // remplacent explicitement cette valeur.
    getEffectiveTenderAnalysisSummaryUseCase = { execute: vi.fn(async () => ({ analysisVersion: 3, dceRevision: 3, analysisFreshness: "CURRENT" })) };
    contextAssembler = {
      assemble: vi.fn(async () => ({
        sectionBlock: "Titre : Méthodologie",
        contextBlock: "## EXIGENCES DCE LIÉES\n- [FIND:REQUIREMENT:req-1] Exigence de méthodologie",
        knownReferences: new Map([["FIND:REQUIREMENT:req-1", { sourceType: "FINDING", findingType: TechnicalMemoRequirementFindingType.Requirement, findingId: "req-1", label: "Exigence 1", content: "Exigence de méthodologie" }]]),
        provenance: { candidateCompanyId: undefined, analysisVersion: 3, dceRevision: 3, analysisFreshness: "CURRENT" },
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

  // Checkpoint 2.1-P2.1-FIX-D (mission §22) — BLOQUANT : jamais un mémoire produit à partir d'une
  // analyse STALE, jamais un passage GENERATING suivi d'un échec (bloqué AVANT toute mutation).
  describe("Freshness precondition (Checkpoint 2.1-P2.1-FIX-D)", () => {
    it("BLOQUANT — refuses to generate when the section has DCE links and the source analysis is STALE, never mutating the section's status", async () => {
      getEffectiveTenderAnalysisSummaryUseCase.execute = vi.fn(async () => ({ analysisVersion: 3, dceRevision: 3, analysisFreshness: "STALE" }));
      const provider = new FakeAIProvider([]);
      const useCase = buildUseCase(provider);

      await expect(useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "BID_MANAGER", technicalMemoId: "memo-1", technicalMemoSectionId: "section-1" })).rejects.toThrow();

      expect(revisionRepository.revisions).toHaveLength(0);
      const section = sectionRepository.sections.find((s) => s.id === "section-1")!;
      expect(section.status).not.toBe(TechnicalMemoSectionStatus.Generating);
      expect(section.status).not.toBe(TechnicalMemoSectionStatus.Failed);
      expect(contextAssembler.assemble).not.toHaveBeenCalled();
    });

    it("does not gate generation on analysis freshness when the section has NO DCE requirement links (never a fabricated dependency)", async () => {
      requirementRepository.links.length = 0;
      getEffectiveTenderAnalysisSummaryUseCase.execute = vi.fn(async () => { throw new Error("should never be called — section has no DCE links"); });
      const provider = new FakeAIProvider([{ kind: "success", result: fakeSectionAIProviderResult({ content: JSON.stringify({ content: "Présentation de l'entreprise.", citations: [], missingDataNotes: [] }) }) }]);
      const useCase = buildUseCase(provider);

      const revision = await useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "BID_MANAGER", technicalMemoId: "memo-1", technicalMemoSectionId: "section-1" });

      expect(revision.content).toBe("Présentation de l'entreprise.");
    });

    it("captures candidateCompanyId/analysisVersion/dceRevision from the context assembler's provenance onto the created revision", async () => {
      contextAssembler.assemble = vi.fn(async () => ({
        sectionBlock: "Titre : Méthodologie",
        contextBlock: "## EXIGENCES DCE LIÉES\n(aucune)",
        knownReferences: new Map(),
        provenance: { candidateCompanyId: "candidate-alpha", analysisVersion: 7, dceRevision: 7, analysisFreshness: "CURRENT" },
      }));
      const provider = new FakeAIProvider([{ kind: "success", result: fakeSectionAIProviderResult({ content: JSON.stringify({ content: "Texte.", citations: [], missingDataNotes: [] }) }) }]);
      const useCase = buildUseCase(provider);

      const revision = await useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "BID_MANAGER", technicalMemoId: "memo-1", technicalMemoSectionId: "section-1" });

      expect(revision.candidateCompanyId).toBe("candidate-alpha");
      expect(revision.analysisVersion).toBe(7);
      expect(revision.dceRevision).toBe(7);
    });
  });

  describe("Consolidation IA — Checkpoint A §3/§6 (routing partagé)", () => {
    function successProvider(): FakeAIProvider {
      return new FakeAIProvider([{ kind: "success", result: fakeSectionAIProviderResult({ content: JSON.stringify({ content: "Texte généré.", citations: [], missingDataNotes: [] }) }) }]);
    }

    it("no RoutingPolicy resolver wired (undefined) — behaves exactly as before, uses TechnicalMemoAiConfig.aiModel", async () => {
      const provider = successProvider();
      const useCase = buildUseCase(provider, undefined);

      await useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "BID_MANAGER", technicalMemoId: "memo-1", technicalMemoSectionId: "section-1" });

      expect(provider.requests[0]?.model).toBe("gpt-4o-mini");
    });

    it("resolver present but no active RoutingPolicy (returns null) — falls back to TechnicalMemoAiConfig.aiModel, never throws", async () => {
      const provider = successProvider();
      const resolver = new FakeRoutingPolicyResolver(null);
      const useCase = buildUseCase(provider, resolver);

      await useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "BID_MANAGER", technicalMemoId: "memo-1", technicalMemoSectionId: "section-1" });

      expect(provider.requests[0]?.model).toBe("gpt-4o-mini");
      expect(resolver.calls).toEqual([{ organizationId: "org-1", promptKey: "TECHNICAL_MEMO_SECTION" }]);
    });

    it("an active RoutingPolicy resolves — the routed model is used instead of TechnicalMemoAiConfig.aiModel", async () => {
      const provider = successProvider();
      const resolver = new FakeRoutingPolicyResolver({ policyId: "policy-1", policyVersion: 1, primaryModel: { provider: "OPENAI", modelKey: "gpt-4.1-mini" } });
      const useCase = buildUseCase(provider, resolver);

      await useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "BID_MANAGER", technicalMemoId: "memo-1", technicalMemoSectionId: "section-1" });

      expect(provider.requests[0]?.model).toBe("gpt-4.1-mini");
    });

    it("BLOQUANT — the routing resolver throwing never fails the generation, falls back to TechnicalMemoAiConfig.aiModel", async () => {
      const provider = successProvider();
      const resolver = new FakeRoutingPolicyResolver(null, true);
      const useCase = buildUseCase(provider, resolver);

      const revision = await useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "BID_MANAGER", technicalMemoId: "memo-1", technicalMemoSectionId: "section-1" });

      expect(revision.aiModel).toBe("gpt-4o-mini");
    });
  });

  describe("Consolidation IA — Checkpoint D (traçabilité des décisions de routing, best-effort)", () => {
    function successProvider(): FakeAIProvider {
      return new FakeAIProvider([{ kind: "success", result: fakeSectionAIProviderResult({ content: JSON.stringify({ content: "Texte généré.", citations: [], missingDataNotes: [] }) }) }]);
    }

    it("BLOQUANT — no writer wired (undefined) — behaves exactly as before, never throws", async () => {
      const provider = successProvider();
      const useCase = buildUseCase(provider, undefined, undefined);

      const revision = await useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "BID_MANAGER", technicalMemoId: "memo-1", technicalMemoSectionId: "section-1" });

      expect(revision.content).toBe("Texte généré.");
    });

    it("complete() is called exactly once on success, with the correct technicalMemoSectionId/tenderId/promptKey/model", async () => {
      const provider = successProvider();
      const writer = new RecordingRoutingDecisionWriter();
      const useCase = buildUseCase(provider, undefined, writer);

      await useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "BID_MANAGER", technicalMemoId: "memo-1", technicalMemoSectionId: "section-1" });

      expect(writer.created).toHaveLength(1);
      expect(writer.created[0]).toMatchObject({ organizationId: "org-1", tenderId: "tender-1", technicalMemoSectionId: "section-1", promptKey: "TECHNICAL_MEMO_SECTION", primaryModel: "gpt-4o-mini" });
      expect(writer.completed).toHaveLength(1);
      expect(writer.completed[0]).toMatchObject({ id: writer.created[0]?.id, selectedModel: "gpt-4o-mini", status: "SUCCEEDED", fallbackLevel: 0, fallbackAttempts: 0 });
    });

    /**
     * Correctif audit P2 Checkpoint D — le test précédent prouve seulement que `create()`/`complete()`
     * sont bien APPELÉS, jamais que `create()` précède réellement l'appel provider dans le temps (ni
     * que `complete()` le suit). `vi.spyOn` sur les DEUX côtés (provider ET writer) partage le même
     * compteur global `invocationCallOrder` de vitest — comparer ces indices prouve l'ORDRE CHRONOLOGIQUE
     * réel des appels, jamais une simple co-occurrence de compteurs.
     */
    it("BLOQUANT — create() happens strictly BEFORE provider.complete(), which happens strictly BEFORE routingDecision.complete() — proven by invocation order, not just call counts", async () => {
      const provider = successProvider();
      const writer = new RecordingRoutingDecisionWriter();
      const providerCompleteSpy = vi.spyOn(provider, "complete");
      const createSpy = vi.spyOn(writer, "create");
      const completeSpy = vi.spyOn(writer, "complete");
      const useCase = buildUseCase(provider, undefined, writer);

      await useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "BID_MANAGER", technicalMemoId: "memo-1", technicalMemoSectionId: "section-1" });

      expect(createSpy).toHaveBeenCalledTimes(1);
      expect(providerCompleteSpy).toHaveBeenCalledTimes(1);
      expect(completeSpy).toHaveBeenCalledTimes(1);
      expect(createSpy.mock.invocationCallOrder[0]).toBeLessThan(providerCompleteSpy.mock.invocationCallOrder[0]!);
      expect(providerCompleteSpy.mock.invocationCallOrder[0]).toBeLessThan(completeSpy.mock.invocationCallOrder[0]!);
    });

    it("BLOQUANT — complete() is called exactly once with status FAILED when the generation ultimately fails", async () => {
      const provider = new FakeAIProvider([
        { kind: "success", result: fakeSectionAIProviderResult({ content: JSON.stringify({ content: "Texte avec source inventée.", citations: [{ sourceRef: "KB:forged-entry" }], missingDataNotes: [] }) }) },
      ]);
      const writer = new RecordingRoutingDecisionWriter();
      const useCase = buildUseCase(provider, undefined, writer);

      await expect(useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "BID_MANAGER", technicalMemoId: "memo-1", technicalMemoSectionId: "section-1" })).rejects.toThrow();

      expect(writer.created).toHaveLength(1);
      expect(writer.completed).toHaveLength(1);
      expect(writer.completed[0]?.status).toBe("FAILED");
    });

    it("BLOQUANT — a writer that throws on create()/complete() never fails an otherwise-successful generation", async () => {
      const provider = successProvider();
      const writer = new ThrowingRoutingDecisionWriter();
      const useCase = buildUseCase(provider, undefined, writer);

      const revision = await useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "BID_MANAGER", technicalMemoId: "memo-1", technicalMemoSectionId: "section-1" });

      expect(revision.content).toBe("Texte généré.");
    });
  });

  describe("Checkpoint TENDEROS-2.1-P2.3-E1.1, FINDING 1 — entitlement gate", () => {
    it("refuses generation (and never mutates the section) when the organization is not entitled to operate on this tender", async () => {
      const provider = new FakeAIProvider([{ kind: "success", result: fakeSectionAIProviderResult({ content: JSON.stringify({ content: "Texte généré.", citations: [], missingDataNotes: [] }) }) }]);
      const entitlementService = fakeEntitlementService(false);
      const useCase = buildUseCase(provider, undefined, undefined, entitlementService);

      await expect(useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "BID_MANAGER", technicalMemoId: "memo-1", technicalMemoSectionId: "section-1" })).rejects.toMatchObject({
        code: "TENDER_OPERATION_NOT_ENTITLED",
      });

      expect(entitlementService.runTenderOperationEntitled).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-1", tenderId: "tender-1" }), expect.any(Function));
      // Le gate d'entitlement s'exécute AVANT `beginGeneration` (markGenerating) : la section reste
      // à son état initial, jamais un passage GENERATING suivi d'un échec.
      const section = sectionRepository.sections.find((s) => s.id === "section-1")!;
      expect(section.status).toBe(TechnicalMemoSectionStatus.Empty);
      expect(revisionRepository.revisions).toHaveLength(0);
    });
  });
});
