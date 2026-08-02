import { describe, expect, it, vi } from "vitest";
import { CreateRevisionFromGenerationUseCase } from "./create-revision-from-generation.use-case";
import type { DeliverableRevisionRepository } from "../ports/deliverable-revision.repository";
import type { DeliverableAccessService } from "../services/deliverable-access.service";
import type { DeliverableStatusRecalculationService } from "../services/deliverable-status-recalculation.service";
import type { GetGenerationUseCase } from "../../../generation";
import { Deliverable } from "../../domain/deliverable.aggregate";
import { DeliverableSection } from "../../domain/deliverable-section.aggregate";
import { DeliverableType } from "../../domain/deliverable-type";
import { GenerationNotUsableForRevisionError } from "../../domain/errors";

const NOW = new Date("2026-09-06T10:00:00.000Z");
const ORGANIZATION_ID = "org-1";

function fakeSection(): DeliverableSection {
  return DeliverableSection.create({
    id: "section-1",
    organizationId: ORGANIZATION_ID,
    deliverableId: "deliverable-1",
    code: "INTRO",
    title: "Introduction",
    order: 0,
    headingLevel: 1,
    mandatory: true,
    occurredAt: NOW,
  });
}

function fakeAccessService(section: DeliverableSection): DeliverableAccessService {
  const deliverable = Deliverable.create({ id: "deliverable-1", organizationId: ORGANIZATION_ID, clientAccountId: "client-1", tenderId: "tender-1", type: DeliverableType.TechnicalMemo, createdBy: "user-1", occurredAt: NOW });
  return { loadSectionContext: vi.fn(async () => ({ section, deliverable, clientAccountId: "client-1" })) } as unknown as DeliverableAccessService;
}

function fakeGeneration(overrides: Record<string, unknown> = {}) {
  return {
    id: "generation-1",
    clientAccountId: "client-1",
    targetRef: "section-1",
    status: "GENERATED",
    version: 1,
    taskType: "TECHNICAL_MEMO_SECTION",
    promptVersionId: "prompt-version-1",
    promptVersionNumber: 3,
    modelProvider: "openai",
    modelKey: "gpt-5",
    routingDecisionId: "routing-1",
    generatedContent: "Contenu généré par l'IA.",
    editedContent: undefined,
    completedAt: "2026-09-05T09:00:00.000Z",
    ...overrides,
  };
}

function fakeGetGenerationUseCase(generation: ReturnType<typeof fakeGeneration>): GetGenerationUseCase {
  return { execute: vi.fn(async () => generation) } as unknown as GetGenerationUseCase;
}

function buildUseCase(input: { section: DeliverableSection; generation: ReturnType<typeof fakeGeneration>; repository?: DeliverableRevisionRepository }) {
  const repository =
    input.repository ??
    ({
      create: vi.fn(async () => undefined),
      nextRevisionNumber: vi.fn(async () => 1),
    } as unknown as DeliverableRevisionRepository);
  const statusRecalculation = { recomputeSection: vi.fn(async () => undefined) } as unknown as DeliverableStatusRecalculationService;
  return new CreateRevisionFromGenerationUseCase(
    fakeAccessService(input.section),
    fakeGetGenerationUseCase(input.generation),
    repository,
    statusRecalculation,
    { now: () => NOW },
    { generate: () => "revision-1" },
  );
}

const baseCommand = { organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", deliverableSectionId: "section-1", generationId: "generation-1" };

/**
 * Correctif audit Codex P2-001 — "traçabilité IA autonome" : une révision créée depuis une
 * génération conserve un snapshot d'audit minimal (taskType/promptVersionId/modelProvider/
 * modelName/routingDecisionId/contextFingerprint/generatedAt), capturé une seule fois, jamais
 * recalculé ensuite.
 */
describe("CreateRevisionFromGenerationUseCase (mission P2-001 — snapshot d'audit IA)", () => {
  it("capture le snapshot d'audit complet depuis la génération", async () => {
    const section = fakeSection();
    const generation = fakeGeneration();
    const useCase = buildUseCase({ section, generation });

    const summary = await useCase.execute(baseCommand);

    expect(summary.aiTaskType).toBe("TECHNICAL_MEMO_SECTION");
    expect(summary.aiPromptVersionId).toBe("prompt-version-1");
    expect(summary.aiModelProvider).toBe("openai");
    expect(summary.aiModelName).toBe("gpt-5");
    expect(summary.aiRoutingDecisionId).toBe("routing-1");
    expect(summary.aiGeneratedAt).toBe("2026-09-05T09:00:00.000Z");
    expect(summary.aiContextFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("le fingerprint est déterministe pour un même contenu généré, et change si le contenu change", async () => {
    const section1 = fakeSection();
    const useCase1 = buildUseCase({ section: section1, generation: fakeGeneration({ generatedContent: "Contenu A" }) });
    const summary1 = await useCase1.execute(baseCommand);

    const section2 = fakeSection();
    const useCase2 = buildUseCase({ section: section2, generation: fakeGeneration({ generatedContent: "Contenu A" }) });
    const summary2 = await useCase2.execute(baseCommand);

    const section3 = fakeSection();
    const useCase3 = buildUseCase({ section: section3, generation: fakeGeneration({ generatedContent: "Contenu B" }) });
    const summary3 = await useCase3.execute(baseCommand);

    expect(summary1.aiContextFingerprint).toBe(summary2.aiContextFingerprint);
    expect(summary1.aiContextFingerprint).not.toBe(summary3.aiContextFingerprint);
  });

  it("replie sur l'heure de création de la révision quand la génération n'a pas de completedAt", async () => {
    const section = fakeSection();
    const useCase = buildUseCase({ section, generation: fakeGeneration({ completedAt: undefined }) });

    const summary = await useCase.execute(baseCommand);

    expect(summary.aiGeneratedAt).toBe(NOW.toISOString());
  });

  it("refuse une génération d'un autre client (mission §57/§58, inchangé)", async () => {
    const section = fakeSection();
    const useCase = buildUseCase({ section, generation: fakeGeneration({ clientAccountId: "client-OTHER" }) });

    await expect(useCase.execute(baseCommand)).rejects.toBeInstanceOf(GenerationNotUsableForRevisionError);
  });
});
