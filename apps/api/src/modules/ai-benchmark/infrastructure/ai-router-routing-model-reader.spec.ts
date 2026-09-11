import { describe, expect, it } from "vitest";
import { AI_TASK_TYPES } from "../../../shared-kernel/ai-task-type";
import { AiModelRouter } from "../../ai-routing/application/services/ai-model-router";
import { AI_ROUTING_MODEL_CATALOG, AiRoutingModel } from "../../ai-routing/domain/ai-routing-model";
import { DEFAULT_ROUTING_MATRIX, isOverrideCompatible } from "../../ai-routing/domain/default-routing-matrix";
import { InMemoryAiModelPreferenceRepository } from "../../ai-routing/test-support/fakes";
import { AiModel } from "../domain/ai-model.aggregate";
import { FIXED_NOW, InMemoryAiModelRepository } from "../test-support/fakes";
import { AiRouterRoutingModelReader } from "./ai-router-routing-model-reader";

const ORG = "org-1";
const USER = "user-1";
const REGISTERED_ID: Record<string, string> = { "gpt-5.4-mini": "model-mini", "gpt-5.4-nano": "model-nano" };

async function harness(options: { registerModels?: boolean } = {}) {
  const preferences = new InMemoryAiModelPreferenceRepository();
  const models = new InMemoryAiModelRepository();
  if (options.registerModels ?? true) {
    for (const [modelKey, id] of Object.entries(REGISTERED_ID)) {
      await models.create(AiModel.create({ id, provider: "OPENAI", modelKey, displayName: modelKey, occurredAt: FIXED_NOW }));
    }
  }
  const reader = new AiRouterRoutingModelReader(new AiModelRouter(preferences), models);
  return { reader, preferences };
}

describe("AiRouterRoutingModelReader", () => {
  it("resolves the model the router really uses for the task, with its registry entry (which carries its price)", async () => {
    const { reader } = await harness();
    const expected = AI_ROUTING_MODEL_CATALOG[DEFAULT_ROUTING_MATRIX.EXECUTIVE_SUMMARY];

    const routed = await reader.resolveModel({ organizationId: ORG, taskType: "EXECUTIVE_SUMMARY" });

    expect(routed).toEqual({ provider: "OPENAI", modelKey: expected.modelKey, aiModelId: REGISTERED_ID[expected.modelKey] });
  });

  it("applies the user's own model preference, exactly like the real generation", async () => {
    const { reader, preferences } = await harness();
    const models = Object.values(AiRoutingModel);
    const taskType = AI_TASK_TYPES.find((task) => models.some((model) => model !== DEFAULT_ROUTING_MATRIX[task] && isOverrideCompatible(task, model)));
    expect(taskType, "une tâche au moins accepte un autre modèle que son défaut").toBeDefined();
    const override = models.find((model) => model !== DEFAULT_ROUTING_MATRIX[taskType!] && isOverrideCompatible(taskType!, model))!;
    await preferences.set({ id: "pref-1", userId: USER, organizationId: ORG, taskType: taskType!, modelOverride: override, occurredAt: FIXED_NOW });

    const routed = await reader.resolveModel({ organizationId: ORG, taskType: taskType!, userId: USER });

    expect(routed?.modelKey).toBe(AI_ROUTING_MODEL_CATALOG[override].modelKey);
  });

  it("leaves the price out — never another model's — when the model really used is not in the registry", async () => {
    const { reader } = await harness({ registerModels: false });

    const routed = await reader.resolveModel({ organizationId: ORG, taskType: "EXECUTIVE_SUMMARY" });

    expect(routed?.aiModelId).toBeUndefined();
    expect(routed?.modelKey).toBe(AI_ROUTING_MODEL_CATALOG[DEFAULT_ROUTING_MATRIX.EXECUTIVE_SUMMARY].modelKey);
  });

  it("returns null for a task type that is not a routable AI task", async () => {
    const { reader } = await harness();

    expect(await reader.resolveModel({ organizationId: ORG, taskType: "NOT_AN_AI_TASK" })).toBeNull();
  });
});
