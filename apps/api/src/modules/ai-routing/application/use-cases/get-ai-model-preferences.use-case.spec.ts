import { beforeEach, describe, expect, it } from "vitest";
import { AI_TASK_TYPES } from "../../../../shared-kernel/ai-task-type";
import { AiRoutingModel } from "../../domain/ai-routing-model";
import { InMemoryAiModelPreferenceRepository } from "../../test-support/fakes";
import { GetAiModelPreferencesUseCase } from "./get-ai-model-preferences.use-case";

const ORG_ID = "org-1";
const USER_ID = "user-1";

describe("GetAiModelPreferencesUseCase — mission §16", () => {
  let repository: InMemoryAiModelPreferenceRepository;
  let useCase: GetAiModelPreferencesUseCase;

  beforeEach(() => {
    repository = new InMemoryAiModelPreferenceRepository();
    useCase = new GetAiModelPreferencesUseCase(repository);
  });

  it("BLOQUANT — returns exactly one row per real AiTaskType, no more, no less", async () => {
    const views = await useCase.execute({ organizationId: ORG_ID, actorId: USER_ID, actorRole: "CONTRIBUTOR" });
    expect(views.map((v) => v.taskType).sort()).toEqual([...AI_TASK_TYPES].sort());
  });

  it("a task with no stored preference shows override=null and effectiveModel=default", async () => {
    const views = await useCase.execute({ organizationId: ORG_ID, actorId: USER_ID, actorRole: "CONTRIBUTOR" });
    const chat = views.find((v) => v.taskType === "CHAT")!;
    expect(chat.override).toBeNull();
    expect(chat.effectiveModel).toBe(AiRoutingModel.Gpt54Mini);
  });

  it("a task with a compatible stored preference shows it as both override and effectiveModel", async () => {
    await repository.set({ id: "p1", userId: USER_ID, organizationId: ORG_ID, taskType: "SECTION_SUMMARY", modelOverride: AiRoutingModel.Gpt54Mini, occurredAt: new Date() });

    const views = await useCase.execute({ organizationId: ORG_ID, actorId: USER_ID, actorRole: "CONTRIBUTOR" });
    const summary = views.find((v) => v.taskType === "SECTION_SUMMARY")!;

    expect(summary.override).toBe(AiRoutingModel.Gpt54Mini);
    expect(summary.effectiveModel).toBe(AiRoutingModel.Gpt54Mini);
  });

  it("mission §37 — a stale/incompatible stored preference is shown as inactive (override null, effective=default), never as a falsely-active override", async () => {
    repository.preferences.push({ id: "stale", userId: USER_ID, organizationId: ORG_ID, taskType: "CHAT", modelOverride: AiRoutingModel.Gpt54Nano, createdAt: new Date(), updatedAt: new Date() });

    const views = await useCase.execute({ organizationId: ORG_ID, actorId: USER_ID, actorRole: "CONTRIBUTOR" });
    const chat = views.find((v) => v.taskType === "CHAT")!;

    expect(chat.override).toBeNull();
    expect(chat.effectiveModel).toBe(AiRoutingModel.Gpt54Mini);
  });

  it("denies READ_ONLY/EXTERNAL_CONSULTANT", async () => {
    await expect(useCase.execute({ organizationId: ORG_ID, actorId: USER_ID, actorRole: "READ_ONLY" })).rejects.toThrow();
  });
});
