import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DceRepository } from "../../../dce";
import { ChecklistItem, ChecklistItemOrigin, ChecklistItemType } from "../../../tenders";
import { InMemoryChecklistItemRepository, InMemoryChecklistReconciliationRepository } from "../../../tenders/test-support/fakes";
import { ReconcileChecklistWithNewAnalysisUseCase } from "./reconcile-checklist-with-new-analysis.use-case";

const ORG = "org-1";
const TENDER = "tender-1";
const OCCURRED_AT = new Date("2026-01-01T00:00:00.000Z");

type FakeRequirement = { id: string; category: string; label: string; isMandatory: boolean; confidence: number; expectedFormat?: string };

function requirementFinding(overrides: Partial<FakeRequirement> = {}): FakeRequirement {
  return { id: randomUUID(), category: "ADMINISTRATIVE", label: "Fournir attestation fiscale", isMandatory: true, confidence: 0.9, ...overrides };
}

function fakeFindingsPage(analysisVersion: number | undefined, items: FakeRequirement[] = []) {
  return { execute: vi.fn(async () => ({ items, total: items.length, limit: 500, offset: 0, analysisVersion })) };
}

function emptyFindingsPage(analysisVersion: number | undefined) {
  return fakeFindingsPage(analysisVersion, []);
}

function fakeDceRepository(revision: number | undefined): DceRepository {
  return { findByTenderId: async () => (revision === undefined ? null : ({ revision } as never)) } as unknown as DceRepository;
}

function fakeGetTenderUseCase() {
  return { execute: vi.fn(async () => ({ id: TENDER, organizationId: ORG })) };
}

describe("ReconcileChecklistWithNewAnalysisUseCase (Checkpoint 2.1-P2.1-FIX-B)", () => {
  let checklistRepository: InMemoryChecklistItemRepository;
  let reconciliationRepository: InMemoryChecklistReconciliationRepository;
  let createAiSuggestionUseCase: { execute: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    checklistRepository = new InMemoryChecklistItemRepository();
    reconciliationRepository = new InMemoryChecklistReconciliationRepository();
    createAiSuggestionUseCase = { execute: vi.fn(async (input: unknown) => ({ id: randomUUID(), status: "PENDING", ...(input as object) })) };
  });

  function buildUseCase(input: { analysisVersion: number | undefined; requirements?: FakeRequirement[]; dceRevision?: number | undefined }) {
    return new ReconcileChecklistWithNewAnalysisUseCase(
      checklistRepository,
      reconciliationRepository,
      fakeDceRepository(input.dceRevision),
      { now: () => OCCURRED_AT },
      { generate: (() => { let n = 0; return () => `id-${++n}`; })() },
      fakeGetTenderUseCase() as never,
      fakeFindingsPage(input.analysisVersion, input.requirements ?? []) as never,
      emptyFindingsPage(input.analysisVersion) as never,
      emptyFindingsPage(input.analysisVersion) as never,
      createAiSuggestionUseCase as never,
    );
  }

  function baseCommand() {
    return { organizationId: ORG, tenderId: TENDER, actorId: "user-1", actorRole: "BID_MANAGER" };
  }

  it("returns a no-op when no analysis has ever succeeded", async () => {
    const useCase = buildUseCase({ analysisVersion: undefined });

    const result = await useCase.execute(baseCommand());

    expect(result).toEqual({ analysisVersion: undefined, newRequirementSuggestionsCreated: 0, possibleChangeSuggestionsCreated: 0, possibleRemovals: [], alreadyReconciled: false });
    expect(createAiSuggestionUseCase.execute).not.toHaveBeenCalled();
  });

  it("TEST C2 — a requirement with no existing match creates a NEW_REQUIREMENT suggestion", async () => {
    const useCase = buildUseCase({ analysisVersion: 1, requirements: [requirementFinding({ label: "Fournir certification ISO 27001" })] });

    const result = await useCase.execute(baseCommand());

    expect(result.newRequirementSuggestionsCreated).toBe(1);
    expect(createAiSuggestionUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: undefined, fieldName: "__create__", proposedValue: expect.objectContaining({ changeKind: "NEW_REQUIREMENT" }) }),
    );
  });

  it("TEST C1 — an unchanged requirement (same title) is matched, generates no suggestion, and requirementFreshness/complianceStatus are preserved", async () => {
    const item = ChecklistItem.create({ id: "item-1", organizationId: ORG, tenderId: TENDER, title: "Fournir attestation fiscale", type: ChecklistItemType.AdministrativeDocument, origin: ChecklistItemOrigin.AiSuggestion, occurredAt: OCCURRED_AT });
    item.validate("user-0", OCCURRED_AT);
    await checklistRepository.save(item);

    const useCase = buildUseCase({ analysisVersion: 1, requirements: [requirementFinding({ label: "Fournir attestation fiscale" })] });
    await useCase.execute(baseCommand());

    expect(createAiSuggestionUseCase.execute).not.toHaveBeenCalled();
    const reloaded = await checklistRepository.findById({ organizationId: ORG, tenderId: TENDER, itemId: "item-1" });
    expect(reloaded?.complianceStatus).toBe("VALIDATED");
    expect(reloaded?.requirementFreshness).toBe("CURRENT");
  });

  it("TEST C4 — a matched item whose title materially changed gets a POSSIBLE_CHANGE suggestion AND is marked STALE, but complianceStatus is never silently mutated", async () => {
    const item = ChecklistItem.create({ id: "item-1", organizationId: ORG, tenderId: TENDER, title: "Fournir attestation fiscale de moins de 3 mois", type: ChecklistItemType.AdministrativeDocument, origin: ChecklistItemOrigin.AiSuggestion, occurredAt: OCCURRED_AT });
    item.validate("user-0", OCCURRED_AT);
    await checklistRepository.save(item);

    // Similarité de titre suffisante pour matcher (mots partagés majoritaires) mais titre différent.
    const useCase = buildUseCase({ analysisVersion: 1, requirements: [requirementFinding({ label: "Fournir attestation fiscale de moins de 6 mois" })] });
    const result = await useCase.execute(baseCommand());

    expect(result.possibleChangeSuggestionsCreated).toBe(1);
    expect(createAiSuggestionUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({ entityId: "item-1", fieldName: "title" }));
    const reloaded = await checklistRepository.findById({ organizationId: ORG, tenderId: TENDER, itemId: "item-1" });
    // BLOQUANT (mission §21) — le statut satisfait n'est jamais silencieusement conservé comme
    // "toujours valide" : le signal STALE le rend visible, sans jamais effacer le travail humain.
    expect(reloaded?.complianceStatus).toBe("VALIDATED");
    expect(reloaded?.requirementFreshness).toBe("STALE");
  });

  it("TEST C3 — a validated item with NO match at all in the new analysis appears in possibleRemovals AND is marked STALE, but complianceStatus is preserved", async () => {
    const item = ChecklistItem.create({ id: "item-1", organizationId: ORG, tenderId: TENDER, title: "Fournir certificat X obsolète", type: ChecklistItemType.AdministrativeDocument, origin: ChecklistItemOrigin.AiSuggestion, occurredAt: OCCURRED_AT });
    item.validate("user-0", OCCURRED_AT);
    await checklistRepository.save(item);

    const useCase = buildUseCase({ analysisVersion: 1, requirements: [requirementFinding({ label: "Une exigence complètement différente sans rapport" })] });
    const result = await useCase.execute(baseCommand());

    expect(result.possibleRemovals).toEqual([{ itemId: "item-1", title: "Fournir certificat X obsolète", reason: expect.any(String) }]);
    const reloaded = await checklistRepository.findById({ organizationId: ORG, tenderId: TENDER, itemId: "item-1" });
    expect(reloaded?.complianceStatus).toBe("VALIDATED");
    expect(reloaded?.requirementFreshness).toBe("STALE");
  });

  it("TEST C5 (correctif audit — bug pré-existant) — a MANUAL item never appears in possibleRemovals and its requirementFreshness is never touched, even with zero matching finding", async () => {
    const manualItem = ChecklistItem.create({ id: "item-manual", organizationId: ORG, tenderId: TENDER, title: "Vérification interne spécifique à cette agence", type: ChecklistItemType.Other, origin: ChecklistItemOrigin.Manual, occurredAt: OCCURRED_AT });
    manualItem.validate("user-0", OCCURRED_AT);
    await checklistRepository.save(manualItem);

    const useCase = buildUseCase({ analysisVersion: 1, requirements: [requirementFinding({ label: "Une exigence complètement différente" })] });
    const result = await useCase.execute(baseCommand());

    expect(result.possibleRemovals).toEqual([]);
    const reloaded = await checklistRepository.findById({ organizationId: ORG, tenderId: TENDER, itemId: "item-manual" });
    expect(reloaded?.requirementFreshness).toBe("CURRENT");
    expect(reloaded?.complianceStatus).toBe("VALIDATED");
  });

  it("TEST C6 — a document attachment on an unchanged, matched item is never touched by reconcile", async () => {
    const item = ChecklistItem.create({ id: "item-1", organizationId: ORG, tenderId: TENDER, title: "Fournir attestation fiscale", type: ChecklistItemType.AdministrativeDocument, origin: ChecklistItemOrigin.AiSuggestion, occurredAt: OCCURRED_AT });
    item.attachDocument({ documentId: "doc-1", documentVersionId: "doc-1-v1", matchStatus: "MANUALLY_ATTACHED" as never }, OCCURRED_AT);
    await checklistRepository.save(item);

    const useCase = buildUseCase({ analysisVersion: 1, requirements: [requirementFinding({ label: "Fournir attestation fiscale" })] });
    await useCase.execute(baseCommand());

    const reloaded = await checklistRepository.findById({ organizationId: ORG, tenderId: TENDER, itemId: "item-1" });
    expect(reloaded?.matchedDocumentId).toBe("doc-1");
    expect(reloaded?.matchedDocumentVersionId).toBe("doc-1-v1");
  });

  it("BLOQUANT TEST C7/§24-25 (correctif audit — P1 non-idempotence) — reconciling the SAME analysisVersion twice never creates duplicate suggestions", async () => {
    const useCase = buildUseCase({ analysisVersion: 1, requirements: [requirementFinding({ label: "Fournir certification ISO 27001" })] });

    const first = await useCase.execute(baseCommand());
    const second = await useCase.execute(baseCommand());

    expect(first.alreadyReconciled).toBe(false);
    expect(first.newRequirementSuggestionsCreated).toBe(1);
    expect(second.alreadyReconciled).toBe(true);
    expect(second.newRequirementSuggestionsCreated).toBe(0);
    expect(createAiSuggestionUseCase.execute).toHaveBeenCalledTimes(1);
  });

  it("a NEW analysisVersion after a change DOES reconcile again (idempotency is scoped per analysisVersion, never global)", async () => {
    const firstUseCase = buildUseCase({ analysisVersion: 1, requirements: [requirementFinding({ label: "Fournir certification ISO 27001" })] });
    await firstUseCase.execute(baseCommand());

    const secondUseCase = buildUseCase({ analysisVersion: 2, requirements: [requirementFinding({ label: "Fournir certification ISO 27001" }), requirementFinding({ label: "Nouvelle exigence en revision 2" })] });
    const result = await secondUseCase.execute(baseCommand());

    expect(result.alreadyReconciled).toBe(false);
    expect(result.newRequirementSuggestionsCreated).toBe(2);
  });

  it("records the reconciliation state (analysisVersion + dceRevision) after a successful reconcile", async () => {
    const useCase = buildUseCase({ analysisVersion: 3, requirements: [], dceRevision: 7 });

    await useCase.execute(baseCommand());

    const state = await reconciliationRepository.find({ organizationId: ORG, tenderId: TENDER });
    expect(state?.lastReconciledAnalysisVersion).toBe(3);
    expect(state?.lastReconciledDceRevision).toBe(7);
    expect(state?.reconciledByUserId).toBe("user-1");
  });

  it("TEST C9 — reconcile scopes both the checklist lookup and the reconciliation upsert to the caller's organizationId (never a value guessed/omitted)", async () => {
    const listByTenderSpy = vi.spyOn(checklistRepository, "listByTender");
    const upsertSpy = vi.spyOn(reconciliationRepository, "upsert");
    const useCase = buildUseCase({ analysisVersion: 1, requirements: [requirementFinding()] });

    await useCase.execute(baseCommand());

    expect(listByTenderSpy).toHaveBeenCalledWith(expect.objectContaining({ organizationId: ORG, tenderId: TENDER }));
    expect(upsertSpy).toHaveBeenCalledWith(expect.objectContaining({ organizationId: ORG, tenderId: TENDER }));
  });
});
