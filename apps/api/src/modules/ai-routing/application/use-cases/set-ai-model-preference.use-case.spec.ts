import { beforeEach, describe, expect, it } from "vitest";
import { AiRoutingModel } from "../../domain/ai-routing-model";
import { IncompatibleModelOverrideError, UnknownAiTaskTypeError } from "../../domain/errors";
import { InMemoryAiModelPreferenceRepository } from "../../test-support/fakes";
import { SetAiModelPreferenceUseCase } from "./set-ai-model-preference.use-case";

class FixedIdGenerator {
  generate(): string {
    return "pref-1";
  }
}
class FixedClock {
  now(): Date {
    return new Date("2026-06-01T00:00:00.000Z");
  }
}

const ORG_ID = "org-1";
const USER_ID = "user-1";

describe("SetAiModelPreferenceUseCase — mission §11/§12/§36", () => {
  let repository: InMemoryAiModelPreferenceRepository;
  let useCase: SetAiModelPreferenceUseCase;

  beforeEach(() => {
    repository = new InMemoryAiModelPreferenceRepository();
    useCase = new SetAiModelPreferenceUseCase(repository, new FixedIdGenerator(), new FixedClock());
  });

  it("BLOQUANT — stores a compatible override (SECTION_SUMMARY accepts MINI)", async () => {
    await useCase.execute({ organizationId: ORG_ID, actorId: USER_ID, actorRole: "CONTRIBUTOR", taskType: "SECTION_SUMMARY", modelOverride: AiRoutingModel.Gpt54Mini });

    const stored = await repository.findOne({ userId: USER_ID, organizationId: ORG_ID, taskType: "SECTION_SUMMARY" });
    expect(stored?.modelOverride).toBe(AiRoutingModel.Gpt54Mini);
  });

  it("BLOQUANT — mission §36 TEST_INCOMPATIBLE_OVERRIDE: refuses NANO for a MINI-only task, never stores it", async () => {
    await expect(useCase.execute({ organizationId: ORG_ID, actorId: USER_ID, actorRole: "CONTRIBUTOR", taskType: "CHAT", modelOverride: AiRoutingModel.Gpt54Nano })).rejects.toThrow(
      IncompatibleModelOverrideError,
    );
    expect(await repository.findOne({ userId: USER_ID, organizationId: ORG_ID, taskType: "CHAT" })).toBeNull();
  });

  it("rejects an unknown task type", async () => {
    await expect(
      useCase.execute({ organizationId: ORG_ID, actorId: USER_ID, actorRole: "CONTRIBUTOR", taskType: "NOT_A_REAL_TASK", modelOverride: AiRoutingModel.Gpt54Mini }),
    ).rejects.toThrow(UnknownAiTaskTypeError);
  });

  it("rejects a model string outside the closed catalog (mission §4/§20 — never a third model)", async () => {
    await expect(useCase.execute({ organizationId: ORG_ID, actorId: USER_ID, actorRole: "CONTRIBUTOR", taskType: "CHAT", modelOverride: "gpt-4o" })).rejects.toThrow(IncompatibleModelOverrideError);
  });

  it("EXTERNAL_CONSULTANT and READ_ONLY are denied (mission — personal setting, same exclusion as Market Watch)", async () => {
    await expect(useCase.execute({ organizationId: ORG_ID, actorId: USER_ID, actorRole: "READ_ONLY", taskType: "CHAT", modelOverride: AiRoutingModel.Gpt54Mini })).rejects.toThrow();
    await expect(useCase.execute({ organizationId: ORG_ID, actorId: USER_ID, actorRole: "EXTERNAL_CONSULTANT", taskType: "CHAT", modelOverride: AiRoutingModel.Gpt54Mini })).rejects.toThrow();
  });

  it("setting a preference twice updates the existing row rather than creating a second one", async () => {
    await useCase.execute({ organizationId: ORG_ID, actorId: USER_ID, actorRole: "CONTRIBUTOR", taskType: "SECTION_SUMMARY", modelOverride: AiRoutingModel.Gpt54Mini });
    await useCase.execute({ organizationId: ORG_ID, actorId: USER_ID, actorRole: "CONTRIBUTOR", taskType: "SECTION_SUMMARY", modelOverride: AiRoutingModel.Gpt54Nano });

    expect(repository.preferences).toHaveLength(1);
    expect(repository.preferences[0]!.modelOverride).toBe(AiRoutingModel.Gpt54Nano);
  });
});
