import { beforeEach, describe, expect, it } from "vitest";
import { AiRoutingModel } from "../../domain/ai-routing-model";
import { InMemoryAiModelPreferenceRepository, ThrowingAiModelPreferenceRepository } from "../../test-support/fakes";
import { AiModelRouter } from "./ai-model-router";

const ORG_ID = "org-1";
const USER_ID = "user-1";

describe("AiModelRouter — mission §19", () => {
  let repository: InMemoryAiModelPreferenceRepository;
  let router: AiModelRouter;

  beforeEach(() => {
    repository = new InMemoryAiModelPreferenceRepository();
    router = new AiModelRouter(repository);
  });

  it("mission §33 TEST_DEFAULT_NANO — a NANO-default task resolves to nano without any configuration", async () => {
    const result = await router.resolve({ taskType: "SECTION_SUMMARY", organizationId: ORG_ID, userId: USER_ID });
    expect(result).toEqual({ provider: "OPENAI", model: AiRoutingModel.Gpt54Nano, modelKey: "gpt-5.4-nano", resolution: "DEFAULT" });
  });

  it("mission §34 TEST_DEFAULT_MINI — a MINI-default task resolves to mini without any configuration", async () => {
    const result = await router.resolve({ taskType: "CHAT", organizationId: ORG_ID, userId: USER_ID });
    expect(result).toEqual({ provider: "OPENAI", model: AiRoutingModel.Gpt54Mini, modelKey: "gpt-5.4-mini", resolution: "DEFAULT" });
  });

  it("mission §15 — resolves without any userId (no config required, e.g. Analysis's async job)", async () => {
    const result = await router.resolve({ taskType: "CHAT", organizationId: ORG_ID });
    expect(result.resolution).toBe("DEFAULT");
    expect(result.model).toBe(AiRoutingModel.Gpt54Mini);
  });

  it("mission §35 TEST_USER_OVERRIDE — a compatible user override wins over the default", async () => {
    await repository.set({ id: "pref-1", userId: USER_ID, organizationId: ORG_ID, taskType: "SECTION_SUMMARY", modelOverride: AiRoutingModel.Gpt54Mini, occurredAt: new Date() });

    const result = await router.resolve({ taskType: "SECTION_SUMMARY", organizationId: ORG_ID, userId: USER_ID });

    expect(result).toEqual({ provider: "OPENAI", model: AiRoutingModel.Gpt54Mini, modelKey: "gpt-5.4-mini", resolution: "USER_OVERRIDE" });
  });

  it("mission §35 — reset to AUTOMATIC (no stored row) resolves back to the default", async () => {
    await repository.set({ id: "pref-1", userId: USER_ID, organizationId: ORG_ID, taskType: "SECTION_SUMMARY", modelOverride: AiRoutingModel.Gpt54Mini, occurredAt: new Date() });
    await repository.reset({ userId: USER_ID, organizationId: ORG_ID, taskType: "SECTION_SUMMARY" });

    const result = await router.resolve({ taskType: "SECTION_SUMMARY", organizationId: ORG_ID, userId: USER_ID });

    expect(result).toEqual({ provider: "OPENAI", model: AiRoutingModel.Gpt54Nano, modelKey: "gpt-5.4-nano", resolution: "DEFAULT" });
  });

  it("BLOQUANT — mission §12/§36/§37: an override that is no longer compatible (matrix changed since it was saved) is ignored, never applied as a silent degradation", async () => {
    // Simule un override NANO devenu incompatible pour une tâche MINI-only (défense en profondeur —
    // ce cas ne devrait normalement jamais exister, `SetAiModelPreferenceUseCase` le refuse à
    // l'écriture, mais le Router doit rester sûr même si la donnée existe déjà en base).
    repository.preferences.push({ id: "stale", userId: USER_ID, organizationId: ORG_ID, taskType: "CHAT", modelOverride: AiRoutingModel.Gpt54Nano, createdAt: new Date(), updatedAt: new Date() });

    const result = await router.resolve({ taskType: "CHAT", organizationId: ORG_ID, userId: USER_ID });

    expect(result.resolution).toBe("DEFAULT");
    expect(result.model).toBe(AiRoutingModel.Gpt54Mini);
  });

  it("mission — a preference repository failure is best-effort, never breaks resolution (falls back to the default)", async () => {
    const throwingRouter = new AiModelRouter(new ThrowingAiModelPreferenceRepository());

    const result = await throwingRouter.resolve({ taskType: "CHAT", organizationId: ORG_ID, userId: USER_ID });

    expect(result.resolution).toBe("DEFAULT");
    expect(result.model).toBe(AiRoutingModel.Gpt54Mini);
  });

  it("resolves correctly when no preference repository is wired at all (defensive @Optional() fallback)", async () => {
    const unwiredRouter = new AiModelRouter();
    const result = await unwiredRouter.resolve({ taskType: "SECTION_SUMMARY", organizationId: ORG_ID, userId: USER_ID });
    expect(result.resolution).toBe("DEFAULT");
    expect(result.model).toBe(AiRoutingModel.Gpt54Nano);
  });

  it("mission §38 — tenant isolation: an override set for (User A, Org A) never applies to (User A, Org B) or (User B, Org A)", async () => {
    await repository.set({ id: "pref-a", userId: "user-a", organizationId: "org-a", taskType: "SECTION_SUMMARY", modelOverride: AiRoutingModel.Gpt54Mini, occurredAt: new Date() });

    const differentOrg = await router.resolve({ taskType: "SECTION_SUMMARY", organizationId: "org-b", userId: "user-a" });
    const differentUser = await router.resolve({ taskType: "SECTION_SUMMARY", organizationId: "org-a", userId: "user-b" });

    expect(differentOrg.resolution).toBe("DEFAULT");
    expect(differentOrg.model).toBe(AiRoutingModel.Gpt54Nano);
    expect(differentUser.resolution).toBe("DEFAULT");
    expect(differentUser.model).toBe(AiRoutingModel.Gpt54Nano);
  });
});
