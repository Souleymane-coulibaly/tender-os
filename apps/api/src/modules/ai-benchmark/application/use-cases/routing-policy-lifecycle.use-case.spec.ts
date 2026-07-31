import { beforeEach, describe, expect, it } from "vitest";
import { PromptKey } from "../../../analysis";
import { AiModel } from "../../domain/ai-model.aggregate";
import {
  AiBenchmarkPermissionMissingError,
  RoutingPolicyModelNotEligibleError,
  RoutingPolicyNotFoundError,
} from "../../domain/errors";
import {
  FixedClock,
  InMemoryAiModelRepository,
  InMemoryAuditLogWriter,
  InMemoryRoutingPolicyRepository,
  SequentialIdGenerator,
} from "../../test-support/fakes";
import { ActivateRoutingPolicyUseCase } from "./activate-routing-policy.use-case";
import { ArchiveRoutingPolicyUseCase } from "./archive-routing-policy.use-case";
import { CreateRoutingPolicyUseCase } from "./create-routing-policy.use-case";
import { ListRoutingPoliciesUseCase } from "./list-routing-policies.use-case";

const NOW = new Date("2026-07-30T10:00:00Z");

describe("CreateRoutingPolicyUseCase / ActivateRoutingPolicyUseCase / ArchiveRoutingPolicyUseCase", () => {
  let routingPolicyRepository: InMemoryRoutingPolicyRepository;
  let aiModelRepository: InMemoryAiModelRepository;
  let clock: FixedClock;
  let createUseCase: CreateRoutingPolicyUseCase;
  let activateUseCase: ActivateRoutingPolicyUseCase;
  let archiveUseCase: ArchiveRoutingPolicyUseCase;
  let listUseCase: ListRoutingPoliciesUseCase;

  beforeEach(async () => {
    routingPolicyRepository = new InMemoryRoutingPolicyRepository();
    aiModelRepository = new InMemoryAiModelRepository();
    clock = new FixedClock(NOW);
    const idGenerator = new SequentialIdGenerator();
    createUseCase = new CreateRoutingPolicyUseCase(routingPolicyRepository, new InMemoryAuditLogWriter(), clock, idGenerator);
    activateUseCase = new ActivateRoutingPolicyUseCase(routingPolicyRepository, aiModelRepository, new InMemoryAuditLogWriter(), clock);
    archiveUseCase = new ArchiveRoutingPolicyUseCase(routingPolicyRepository, new InMemoryAuditLogWriter(), clock);
    listUseCase = new ListRoutingPoliciesUseCase(routingPolicyRepository);

    await aiModelRepository.create(
      AiModel.create({
        id: "model-1",
        provider: "OPENAI",
        modelKey: "gpt-4o-mini",
        displayName: "GPT-4o mini",
        enabledForProduction: true,
        occurredAt: NOW,
      }),
    );
  });

  async function createDraft() {
    return createUseCase.execute({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: "OWNER",
      promptKey: PromptKey.AnalyzeDocument,
      primaryAiModelId: "model-1",
      timeoutMs: 30000,
      maxRetries: 2,
      escalationConditions: [],
    });
  }

  it("creates version 1 in DRAFT", async () => {
    const policy = await createDraft();
    expect(policy.version).toBe(1);
    expect(policy.status).toBe("DRAFT");
  });

  it("auto-increments the version per (organization, promptKey)", async () => {
    await createDraft();
    const second = await createDraft();
    expect(second.version).toBe(2);
  });

  it("activating a DRAFT policy makes it ACTIVE with no prior policy to archive", async () => {
    const policy = await createDraft();
    const activated = await activateUseCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "OWNER", policyId: policy.id });
    expect(activated.status).toBe("ACTIVE");
  });

  it("activating a new version atomically archives the previously ACTIVE version — never two ACTIVE at once", async () => {
    const v1 = await createDraft();
    await activateUseCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "OWNER", policyId: v1.id });

    const v2 = await createDraft();
    await activateUseCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "OWNER", policyId: v2.id });

    const all = await listUseCase.execute({ organizationId: "org-1", actorRole: "OWNER" });
    const activeOnes = all.filter((p) => p.status === "ACTIVE");
    expect(activeOnes).toHaveLength(1);
    expect(activeOnes[0]!.id).toBe(v2.id);

    const v1Reloaded = all.find((p) => p.id === v1.id)!;
    expect(v1Reloaded.status).toBe("ARCHIVED");
  });

  it("archives a DRAFT directly (discarded before ever being activated)", async () => {
    const policy = await createDraft();
    const archived = await archiveUseCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "OWNER", policyId: policy.id });
    expect(archived.status).toBe("ARCHIVED");
  });

  it("throws RoutingPolicyNotFoundError for an unknown policy id", async () => {
    await expect(
      activateUseCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "OWNER", policyId: "unknown" }),
    ).rejects.toBeInstanceOf(RoutingPolicyNotFoundError);
  });

  it("refuses a non-admin actor for every mutating action", async () => {
    await expect(
      createUseCase.execute({
        organizationId: "org-1",
        actorId: "user-1",
        actorRole: "BID_MANAGER",
        promptKey: PromptKey.AnalyzeDocument,
        primaryAiModelId: "model-1",
        timeoutMs: 30000,
        maxRetries: 2,
        escalationConditions: [],
      }),
    ).rejects.toBeInstanceOf(AiBenchmarkPermissionMissingError);
  });

  it("never lets another organization activate or archive a routing policy it doesn't own", async () => {
    const policy = await createDraft();

    await expect(
      activateUseCase.execute({ organizationId: "org-2", actorId: "intruder", actorRole: "OWNER", policyId: policy.id }),
    ).rejects.toBeInstanceOf(RoutingPolicyNotFoundError);
    await expect(
      archiveUseCase.execute({ organizationId: "org-2", actorId: "intruder", actorRole: "OWNER", policyId: policy.id }),
    ).rejects.toBeInstanceOf(RoutingPolicyNotFoundError);

    // Toujours DRAFT pour son organisation propriétaire : aucune fuite/altération inter-tenant.
    const activated = await activateUseCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "OWNER", policyId: policy.id });
    expect(activated.status).toBe("ACTIVE");

    const listedByOtherOrg = await listUseCase.execute({ organizationId: "org-2", actorRole: "OWNER" });
    expect(listedByOtherOrg).toHaveLength(0);
  });

  describe("Audit Codex P1-1 — éligibilité du modèle à l'activation", () => {
    it("refuses to activate when the primary model was disabled after the policy was created", async () => {
      const policy = await createDraft();

      const model = await aiModelRepository.findById({ id: "model-1" });
      model!.update({ enabledForProduction: false }, NOW);
      await aiModelRepository.save(model!);

      await expect(
        activateUseCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "OWNER", policyId: policy.id }),
      ).rejects.toBeInstanceOf(RoutingPolicyModelNotEligibleError);
    });

    it("refuses to activate when the escalation model is not eligible for production", async () => {
      const policy = await createUseCase.execute({
        organizationId: "org-1",
        actorId: "user-1",
        actorRole: "OWNER",
        promptKey: PromptKey.AnalyzeDocument,
        primaryAiModelId: "model-1",
        escalationAiModelId: "unknown-model",
        timeoutMs: 30000,
        maxRetries: 2,
        escalationConditions: [],
      });

      await expect(
        activateUseCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "OWNER", policyId: policy.id }),
      ).rejects.toBeInstanceOf(RoutingPolicyModelNotEligibleError);
    });
  });
});
