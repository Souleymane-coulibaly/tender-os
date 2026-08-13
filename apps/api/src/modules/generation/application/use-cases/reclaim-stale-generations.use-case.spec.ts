import { beforeEach, describe, expect, it, vi } from "vitest";
import { Generation } from "../../domain/generation.aggregate";
import { GenerationStatus } from "../../domain/generation-status";
import { GenerationTaskType } from "../../domain/generation-task-type";
import { InMemoryGenerationRepository, RecordingGenerationDispatcher } from "../../test-support/fakes";
import { ReclaimStaleGenerationsUseCase } from "./reclaim-stale-generations.use-case";

const ORG = "org-1";
const NOW = new Date("2026-08-01T10:00:00.000Z");
const TEN_MINUTES_MS = 10 * 60 * 1000;

function createRoot(id: string): Generation {
  return Generation.create({
    id,
    organizationId: ORG,
    clientAccountId: "client-1",
    tenderId: "tender-1",
    taskType: GenerationTaskType.ExecutiveSummary,
    rootGenerationId: id,
    version: 1,
    promptTemplateId: "template-1",
    promptVersionId: "version-1",
    promptVersionNumber: 1,
    createdBy: "user-1",
    occurredAt: NOW,
  });
}

describe("ReclaimStaleGenerationsUseCase", () => {
  let repository: InMemoryGenerationRepository;
  let dispatcher: RecordingGenerationDispatcher;

  beforeEach(() => {
    repository = new InMemoryGenerationRepository();
    dispatcher = new RecordingGenerationDispatcher();
  });

  function buildUseCase(): ReclaimStaleGenerationsUseCase {
    return new ReclaimStaleGenerationsUseCase(repository, dispatcher);
  }

  it("BLOQUANT (mission PARTIE F) — resets a generation stuck GENERATING beyond the threshold back to PENDING and re-dispatches it", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW.getTime() - TEN_MINUTES_MS - 1));
    const generation = createRoot("gen-1");
    await repository.create(generation);
    await repository.reserveForGenerating({ organizationId: ORG, generationId: "gen-1", occurredAt: new Date() });
    vi.setSystemTime(NOW);

    const result = await buildUseCase().execute({ staleThresholdMs: TEN_MINUTES_MS, batchSize: 50 });

    expect(result.reclaimed).toBe(1);
    const stored = await repository.findById({ organizationId: ORG, generationId: "gen-1" });
    expect(stored?.status).toBe(GenerationStatus.Pending);
    expect(dispatcher.dispatched).toEqual([{ organizationId: ORG, generationId: "gen-1" }]);
    vi.useRealTimers();
  });

  it("never touches a GENERATING generation still within the threshold", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const generation = createRoot("gen-2");
    await repository.create(generation);
    await repository.reserveForGenerating({ organizationId: ORG, generationId: "gen-2", occurredAt: new Date() });

    const result = await buildUseCase().execute({ staleThresholdMs: TEN_MINUTES_MS, batchSize: 50 });

    expect(result.reclaimed).toBe(0);
    const stored = await repository.findById({ organizationId: ORG, generationId: "gen-2" });
    expect(stored?.status).toBe(GenerationStatus.Generating);
    expect(dispatcher.dispatched).toHaveLength(0);
    vi.useRealTimers();
  });

  it("never touches a PENDING generation (only GENERATING is a stuck-state candidate)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW.getTime() - TEN_MINUTES_MS - 1));
    const generation = createRoot("gen-3");
    await repository.create(generation);
    vi.setSystemTime(NOW);

    const result = await buildUseCase().execute({ staleThresholdMs: TEN_MINUTES_MS, batchSize: 50 });

    expect(result.reclaimed).toBe(0);
    expect(dispatcher.dispatched).toHaveLength(0);
    vi.useRealTimers();
  });

  it("BLOQUANT (réaudit externe — course de finalisation) — never overwrites a generation that the real worker finalized in the window between the reclaim's read and its write", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW.getTime() - TEN_MINUTES_MS - 1));
    const generation = createRoot("gen-race");
    await repository.create(generation);
    await repository.reserveForGenerating({ organizationId: ORG, generationId: "gen-race", occurredAt: new Date() });
    vi.setSystemTime(NOW);

    // Simule EXACTEMENT la fenêtre que le compare-and-set doit fermer : le worker réel
    // (`ProcessGenerationUseCase.finalizeGeneration`) termine la génération juste après que le use
    // case de reprise l'ait lue (`findById`), mais avant qu'il n'écrive sa propre mutation.
    const originalFindById = repository.findById.bind(repository);
    let findByIdCallCount = 0;
    repository.findById = async (input: { organizationId: string; generationId: string }) => {
      const result = await originalFindById(input);
      findByIdCallCount += 1;
      if (findByIdCallCount === 1 && result) {
        await repository.finalizeGeneration({
          organizationId: ORG,
          generationId: "gen-race",
          expectedAttemptCount: result.attemptCount,
          occurredAt: NOW,
          outcome: { kind: "generated", modelProvider: "OPENAI", modelKey: "gpt-4o", fallbackLevel: 0, latencyMs: 100 },
        });
      }
      return result;
    };

    const result = await buildUseCase().execute({ staleThresholdMs: TEN_MINUTES_MS, batchSize: 50 });

    expect(result.reclaimed).toBe(0);
    expect(dispatcher.dispatched).toHaveLength(0);
    const stored = await originalFindById({ organizationId: ORG, generationId: "gen-race" });
    expect(stored?.status).toBe(GenerationStatus.Generated);
    vi.useRealTimers();
  });
});
