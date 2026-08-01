import { describe, expect, it } from "vitest";
import { Generation } from "./generation.aggregate";
import { GenerationStatus } from "./generation-status";
import { GenerationTaskType } from "./generation-task-type";

const NOW = new Date("2026-08-01T10:00:00.000Z");

function createRoot(): Generation {
  return Generation.create({
    id: "gen-1",
    organizationId: "org-1",
    clientAccountId: "client-1",
    tenderId: "tender-1",
    taskType: GenerationTaskType.ExecutiveSummary,
    rootGenerationId: "gen-1",
    version: 1,
    promptTemplateId: "template-1",
    promptVersionId: "version-1",
    promptVersionNumber: 1,
    createdBy: "user-1",
    occurredAt: NOW,
  });
}

describe("Generation aggregate", () => {
  it("starts PENDING with attemptCount 0", () => {
    const generation = createRoot();
    expect(generation.status).toBe(GenerationStatus.Pending);
    expect(generation.attemptCount).toBe(0);
  });

  it("reserve() moves to GENERATING and increments attemptCount", () => {
    const generation = createRoot();
    generation.reserve();
    expect(generation.status).toBe(GenerationStatus.Generating);
    expect(generation.attemptCount).toBe(1);
  });

  it("markGenerated() records model/tokens/cost and clears any prior error", () => {
    const generation = createRoot();
    generation.reserve();
    generation.markGenerated(
      {
        modelProvider: "OPENAI",
        modelKey: "gpt-4o",
        fallbackLevel: 0,
        generatedContent: "Hello",
        inputTokenCount: 10,
        outputTokenCount: 20,
        totalTokenCount: 30,
        latencyMs: 500,
      },
      NOW,
    );
    expect(generation.status).toBe(GenerationStatus.Generated);
    expect(generation.generatedContent).toBe("Hello");
    expect(generation.errorCode).toBeUndefined();
  });

  it("markFailed() then resetForRetry() allows exactly one reopening edge, FAILED -> PENDING", () => {
    const generation = createRoot();
    generation.reserve();
    generation.markFailed({ errorCode: "GEN_AI_TIMEOUT", errorMessage: "timed out" }, NOW);
    expect(generation.status).toBe(GenerationStatus.Failed);
    generation.resetForRetry();
    expect(generation.status).toBe(GenerationStatus.Pending);
    expect(generation.errorCode).toBeUndefined();
  });

  it("resetForRetry() throws if the generation is not FAILED", () => {
    const generation = createRoot();
    expect(() => generation.resetForRetry()).toThrow();
  });

  it("cancel() is only allowed from PENDING or GENERATING", () => {
    const generation = createRoot();
    generation.cancel(NOW);
    expect(generation.status).toBe(GenerationStatus.Cancelled);

    const other = createRoot();
    other.reserve();
    other.markGenerated({ modelProvider: "OPENAI", modelKey: "gpt-4o", fallbackLevel: 0, latencyMs: 1 }, NOW);
    expect(() => other.cancel(NOW)).toThrow();
  });

  it("applyEdit() only succeeds on a GENERATED generation, and never mixes edited/generated content silently", () => {
    const generation = createRoot();
    expect(() => generation.applyEdit({ editedBy: "user-2", editedContent: "edited" }, NOW)).toThrow();

    generation.reserve();
    generation.markGenerated(
      { modelProvider: "OPENAI", modelKey: "gpt-4o", fallbackLevel: 0, generatedContent: "AI content", latencyMs: 1 },
      NOW,
    );
    generation.applyEdit({ editedBy: "user-2", editedContent: "human content" }, NOW);
    expect(generation.generatedContent).toBe("AI content");
    expect(generation.editedContent).toBe("human content");
    expect(generation.editedBy).toBe("user-2");
  });

  it("validate() only succeeds on a GENERATED generation and is traceable", () => {
    const generation = createRoot();
    expect(() => generation.validate({ validatedBy: "user-3" }, NOW)).toThrow();

    generation.reserve();
    generation.markGenerated({ modelProvider: "OPENAI", modelKey: "gpt-4o", fallbackLevel: 0, latencyMs: 1 }, NOW);
    generation.validate({ validatedBy: "user-3" }, NOW);
    expect(generation.validatedBy).toBe("user-3");
    expect(generation.validatedAt).toEqual(NOW);
  });

  it("réaudit Codex P1 — reject() only succeeds on a GENERATED generation, is traceable, and never touches generatedContent/editedContent", () => {
    const generation = createRoot();
    expect(() => generation.reject({ rejectedBy: "user-4" }, NOW)).toThrow();

    generation.reserve();
    generation.markGenerated({ modelProvider: "OPENAI", modelKey: "gpt-4o", fallbackLevel: 0, generatedContent: "AI content", latencyMs: 1 }, NOW);
    generation.applyEdit({ editedBy: "user-2", editedContent: "human content" }, NOW);
    generation.reject({ rejectedBy: "user-4", reason: "Hors sujet" }, NOW);

    expect(generation.rejectedBy).toBe("user-4");
    expect(generation.rejectedAt).toEqual(NOW);
    expect(generation.rejectionReason).toBe("Hors sujet");
    // Jamais une réécriture rétroactive du contenu IA ni du contenu édité.
    expect(generation.generatedContent).toBe("AI content");
    expect(generation.editedContent).toBe("human content");
    expect(generation.status).toBe(GenerationStatus.Generated);
  });

  it("réaudit Codex P1 — reject() throws on FAILED (nothing was ever generated)", () => {
    const generation = createRoot();
    generation.reserve();
    generation.markFailed({ errorCode: "X", errorMessage: "boom" }, NOW);
    expect(() => generation.reject({ rejectedBy: "user-4" }, NOW)).toThrow();
  });

  it("réaudit Codex P1 — validation et rejet sont mutuellement exclusifs (statuts incompatibles)", () => {
    const validated = createRoot();
    validated.reserve();
    validated.markGenerated({ modelProvider: "OPENAI", modelKey: "gpt-4o", fallbackLevel: 0, latencyMs: 1 }, NOW);
    validated.validate({ validatedBy: "user-3" }, NOW);
    expect(() => validated.reject({ rejectedBy: "user-4" }, NOW)).toThrow();

    const rejected = createRoot();
    rejected.reserve();
    rejected.markGenerated({ modelProvider: "OPENAI", modelKey: "gpt-4o", fallbackLevel: 0, latencyMs: 1 }, NOW);
    rejected.reject({ rejectedBy: "user-4" }, NOW);
    expect(() => rejected.validate({ validatedBy: "user-3" }, NOW)).toThrow();
  });

  it("a regenerated version (built by the use case, not the aggregate) shares rootGenerationId with version 1", () => {
    const root = createRoot();
    const secondVersion = Generation.create({
      id: "gen-2",
      organizationId: "org-1",
      clientAccountId: "client-1",
      tenderId: "tender-1",
      taskType: GenerationTaskType.ExecutiveSummary,
      parentGenerationId: root.id,
      rootGenerationId: root.rootGenerationId,
      version: 2,
      promptTemplateId: "template-1",
      promptVersionId: "version-1",
      promptVersionNumber: 1,
      createdBy: "user-1",
      occurredAt: NOW,
    });
    expect(secondVersion.rootGenerationId).toBe(root.id);
    expect(secondVersion.parentGenerationId).toBe(root.id);
    expect(secondVersion.version).toBe(2);
  });
});
