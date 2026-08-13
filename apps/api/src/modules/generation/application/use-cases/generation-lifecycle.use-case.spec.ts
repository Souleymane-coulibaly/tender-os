import { beforeEach, describe, expect, it } from "vitest";
import { CancelGenerationUseCase } from "./cancel-generation.use-case";
import { EditGenerationUseCase } from "./edit-generation.use-case";
import { LaunchGenerationUseCase } from "./launch-generation.use-case";
import { RegenerateGenerationUseCase } from "./regenerate-generation.use-case";
import { RetryGenerationUseCase } from "./retry-generation.use-case";
import { ValidateGenerationUseCase } from "./validate-generation.use-case";
import { GetClientAccountUseCase } from "../../../client-portfolio";
import { ClientAccount } from "../../../client-portfolio/domain/client-account.aggregate";
import { ClientAssignment } from "../../../client-portfolio/domain/client-assignment.entity";
import { ClientRole } from "../../../client-portfolio/domain/client-role";
import { InMemoryClientAccountRepository } from "../../../client-portfolio/test-support/fakes";
import { GetTenderUseCase } from "../../../tenders";
import { Tender } from "../../../tenders/domain/tender.aggregate";
import { TenderId } from "../../../tenders/domain/tender-id.value-object";
import { InMemoryTenderRepository } from "../../../tenders/test-support/fakes";
import { GenerationOutputMode } from "../../domain/generation-output-mode";
import { GenerationStatus } from "../../domain/generation-status";
import { GenerationTaskType } from "../../domain/generation-task-type";
import type { GenerationConfig } from "../../infrastructure/generation-config";
import { PromptTemplate } from "../../domain/prompt-template.aggregate";
import { PromptVersion } from "../../domain/prompt-version.entity";
import {
  FixedClock,
  InMemoryAuditLogWriter,
  InMemoryGenerationRepository,
  InMemoryPromptTemplateRepository,
  InMemoryPromptVersionRepository,
  SequentialIdGenerator,
  buildAssertClientAccessUseCase,
} from "../../test-support/fakes";

const ORG = "org-1";
const CLIENT = "client-1";
const TENDER = "tender-1";
const NOW = new Date("2026-08-01T10:00:00.000Z");
const CONFIG: GenerationConfig = { aiModel: "gpt-4o-mini", aiTimeoutMs: 60_000, aiMaxRetries: 2, aiRetryDelayMs: 0, modelRates: {} };

class RecordingDispatcher {
  readonly dispatched: { generationId: string }[] = [];
  dispatch(input: { generationId: string }): void {
    this.dispatched.push({ generationId: input.generationId });
  }
}

function buildHarness() {
  const clock = new FixedClock(NOW);
  const idGenerator = new SequentialIdGenerator();
  const generationRepository = new InMemoryGenerationRepository();
  const promptTemplateRepository = new InMemoryPromptTemplateRepository();
  const promptVersionRepository = new InMemoryPromptVersionRepository();
  const auditLogWriter = new InMemoryAuditLogWriter();
  const dispatcher = new RecordingDispatcher();

  const { assertClientAccessUseCase, clientAssignmentRepository } = buildAssertClientAccessUseCase();
  const clientAccountRepository = new InMemoryClientAccountRepository();
  const tenderRepository = new InMemoryTenderRepository();

  const client = ClientAccount.create({
    id: CLIENT,
    organizationId: ORG,
    name: "Client A",
    createdBy: "user-owner",
    occurredAt: NOW,
  });
  void clientAccountRepository.create(client);

  const tender = Tender.create({
    id: TenderId.from(TENDER),
    organizationId: ORG,
    clientAccountId: CLIENT,
    title: "Marché de fournitures",
    createdBy: "user-owner",
    occurredAt: NOW,
  });
  void tenderRepository.seed(tender);

  const getTenderUseCase = new GetTenderUseCase(tenderRepository, assertClientAccessUseCase);
  const getClientAccountUseCase = new GetClientAccountUseCase(clientAccountRepository, assertClientAccessUseCase);

  const launch = new LaunchGenerationUseCase(
    getTenderUseCase,
    assertClientAccessUseCase,
    promptTemplateRepository,
    promptVersionRepository,
    generationRepository,
    dispatcher,
    auditLogWriter,
    clock,
    idGenerator,
  );
  const retry = new RetryGenerationUseCase(generationRepository, assertClientAccessUseCase, dispatcher, clock, CONFIG);
  const regenerate = new RegenerateGenerationUseCase(
    generationRepository,
    promptVersionRepository,
    assertClientAccessUseCase,
    dispatcher,
    auditLogWriter,
    clock,
    idGenerator,
  );
  const cancel = new CancelGenerationUseCase(generationRepository, assertClientAccessUseCase, clock);
  const edit = new EditGenerationUseCase(generationRepository, assertClientAccessUseCase, clock);
  const validate = new ValidateGenerationUseCase(generationRepository, assertClientAccessUseCase, clock);

  return {
    launch,
    retry,
    regenerate,
    cancel,
    edit,
    validate,
    generationRepository,
    promptTemplateRepository,
    promptVersionRepository,
    clientAssignmentRepository,
    getClientAccountUseCase,
    dispatcher,
  };
}

async function seedActiveTemplate(h: ReturnType<typeof buildHarness>) {
  const template = PromptTemplate.create({
    id: "template-1",
    organizationId: ORG,
    taskType: GenerationTaskType.ExecutiveSummary,
    name: "Synthèse",
    outputMode: GenerationOutputMode.FreeText,
    createdBy: "user-1",
    occurredAt: NOW,
  });
  await h.promptTemplateRepository.create(template);
  const version = PromptVersion.create({
    id: "version-1",
    organizationId: ORG,
    promptTemplateId: template.id,
    version: 1,
    systemPrompt: "S",
    userPromptTemplate: "U",
    requiredVariables: [],
    authorUserId: "user-1",
    occurredAt: NOW,
  });
  version.activate(NOW);
  await h.promptVersionRepository.create(version);
  return { template, version };
}

describe("Generation lifecycle (launch/retry/regenerate/cancel/edit/validate)", () => {
  let h: ReturnType<typeof buildHarness>;
  beforeEach(async () => {
    h = buildHarness();
    await seedActiveTemplate(h);
  });

  it("OWNER can launch a generation; it dispatches for processing", async () => {
    const result = await h.launch.execute({
      organizationId: ORG,
      actorId: "user-owner",
      actorRole: "OWNER",
      tenderId: TENDER,
      taskType: GenerationTaskType.ExecutiveSummary,
    });
    expect(result.status).toBe(GenerationStatus.Pending);
    expect(h.dispatcher.dispatched).toHaveLength(1);
  });

  it("rejects a second launch for the same in-flight target (double-generation guard)", async () => {
    await h.launch.execute({
      organizationId: ORG,
      actorId: "user-owner",
      actorRole: "OWNER",
      tenderId: TENDER,
      taskType: GenerationTaskType.ExecutiveSummary,
    });
    await expect(
      h.launch.execute({
        organizationId: ORG,
        actorId: "user-owner",
        actorRole: "OWNER",
        tenderId: TENDER,
        taskType: GenerationTaskType.ExecutiveSummary,
      }),
    ).rejects.toThrow();
  });

  it("a VIEWER-tier client assignment cannot launch (read-only)", async () => {
    h.clientAssignmentRepository.create(
      ClientAssignment.create({
        id: "assignment-1",
        organizationId: ORG,
        clientAccountId: CLIENT,
        userId: "user-viewer",
        role: ClientRole.Viewer,
        createdBy: "user-owner",
        occurredAt: NOW,
      }),
    );
    await expect(
      h.launch.execute({
        organizationId: ORG,
        actorId: "user-viewer",
        actorRole: "CONTRIBUTOR",
        tenderId: TENDER,
        taskType: GenerationTaskType.ExecutiveSummary,
      }),
    ).rejects.toThrow();
  });

  it("a CONTRIBUTOR-tier client assignment CAN launch (assigned, write-capable)", async () => {
    h.clientAssignmentRepository.create(
      ClientAssignment.create({
        id: "assignment-1",
        organizationId: ORG,
        clientAccountId: CLIENT,
        userId: "user-contrib",
        role: ClientRole.Contributor,
        createdBy: "user-owner",
        occurredAt: NOW,
      }),
    );
    await expect(
      h.launch.execute({
        organizationId: ORG,
        actorId: "user-contrib",
        actorRole: "CONTRIBUTOR",
        tenderId: TENDER,
        taskType: GenerationTaskType.ExecutiveSummary,
      }),
    ).resolves.toMatchObject({ status: GenerationStatus.Pending });
  });

  it("retry reuses the same row/version (FAILED -> PENDING), never a new version", async () => {
    const launched = await h.launch.execute({
      organizationId: ORG,
      actorId: "user-owner",
      actorRole: "OWNER",
      tenderId: TENDER,
      taskType: GenerationTaskType.ExecutiveSummary,
    });
    const generation = await h.generationRepository.findById({ organizationId: ORG, generationId: launched.id });
    generation!.reserve();
    generation!.markFailed({ errorCode: "X", errorMessage: "boom" }, NOW);
    await h.generationRepository.save(generation!);

    const retried = await h.retry.execute({ organizationId: ORG, actorId: "user-owner", actorRole: "OWNER", generationId: launched.id });
    expect(retried.id).toBe(launched.id);
    expect(retried.version).toBe(1);
    expect(retried.status).toBe(GenerationStatus.Pending);
  });

  it("BLOQUANT (mission Sprint 21 hardening) — refuses to retry once the attempt cap (1 + aiMaxRetries) is reached, never an unlimited retry loop", async () => {
    const launched = await h.launch.execute({
      organizationId: ORG,
      actorId: "user-owner",
      actorRole: "OWNER",
      tenderId: TENDER,
      taskType: GenerationTaskType.ExecutiveSummary,
    });
    const generation = await h.generationRepository.findById({ organizationId: ORG, generationId: launched.id });
    // CONFIG.aiMaxRetries = 2 → 3 tentatives autorisées au total. Simule les 2 premiers retries
    // directement sur l'agrégat (jamais via HTTP répété, pour ne pas dépendre d'un dispatcher réel).
    generation!.reserve();
    generation!.markFailed({ errorCode: "X", errorMessage: "boom" }, NOW); // attemptCount = 1
    await h.generationRepository.save(generation!);
    await h.retry.execute({ organizationId: ORG, actorId: "user-owner", actorRole: "OWNER", generationId: launched.id });
    generation!.reserve();
    generation!.markFailed({ errorCode: "X", errorMessage: "boom" }, NOW); // attemptCount = 2
    await h.generationRepository.save(generation!);
    await h.retry.execute({ organizationId: ORG, actorId: "user-owner", actorRole: "OWNER", generationId: launched.id });
    generation!.reserve();
    generation!.markFailed({ errorCode: "X", errorMessage: "boom" }, NOW); // attemptCount = 3 (cap reached)
    await h.generationRepository.save(generation!);

    await expect(h.retry.execute({ organizationId: ORG, actorId: "user-owner", actorRole: "OWNER", generationId: launched.id })).rejects.toThrow();
  });

  it("regenerate creates a NEW version under the same root, never overwrites the original row", async () => {
    const first = await h.launch.execute({
      organizationId: ORG,
      actorId: "user-owner",
      actorRole: "OWNER",
      tenderId: TENDER,
      taskType: GenerationTaskType.ExecutiveSummary,
    });
    const firstGeneration = await h.generationRepository.findById({ organizationId: ORG, generationId: first.id });
    firstGeneration!.reserve();
    firstGeneration!.markGenerated({ modelProvider: "OPENAI", modelKey: "gpt-4o-mini", fallbackLevel: 0, generatedContent: "v1", latencyMs: 1 }, NOW);
    await h.generationRepository.save(firstGeneration!);

    const second = await h.regenerate.execute({ organizationId: ORG, actorId: "user-owner", actorRole: "OWNER", generationId: first.id });
    expect(second.id).not.toBe(first.id);
    expect(second.version).toBe(2);
    expect(second.rootGenerationId).toBe(first.id);
    expect(second.parentGenerationId).toBe(first.id);

    const original = await h.generationRepository.findById({ organizationId: ORG, generationId: first.id });
    expect(original?.generatedContent).toBe("v1"); // never overwritten
  });

  it("cancel is only allowed from PENDING/GENERATING", async () => {
    const launched = await h.launch.execute({
      organizationId: ORG,
      actorId: "user-owner",
      actorRole: "OWNER",
      tenderId: TENDER,
      taskType: GenerationTaskType.ExecutiveSummary,
    });
    const cancelled = await h.cancel.execute({ organizationId: ORG, actorId: "user-owner", actorRole: "OWNER", generationId: launched.id });
    expect(cancelled.status).toBe(GenerationStatus.Cancelled);
  });

  it("edit never mixes AI content with human content silently, and only works on GENERATED", async () => {
    const launched = await h.launch.execute({
      organizationId: ORG,
      actorId: "user-owner",
      actorRole: "OWNER",
      tenderId: TENDER,
      taskType: GenerationTaskType.ExecutiveSummary,
    });
    await expect(
      h.edit.execute({ organizationId: ORG, actorId: "user-owner", actorRole: "OWNER", generationId: launched.id, editedContent: "x" }),
    ).rejects.toThrow();

    const generation = await h.generationRepository.findById({ organizationId: ORG, generationId: launched.id });
    generation!.reserve();
    generation!.markGenerated({ modelProvider: "OPENAI", modelKey: "gpt-4o-mini", fallbackLevel: 0, generatedContent: "AI text", latencyMs: 1 }, NOW);
    await h.generationRepository.save(generation!);

    const edited = await h.edit.execute({
      organizationId: ORG,
      actorId: "user-owner",
      actorRole: "OWNER",
      generationId: launched.id,
      editedContent: "human text",
    });
    expect(edited.generatedContent).toBe("AI text");
    expect(edited.editedContent).toBe("human text");
    expect(edited.editedBy).toBe("user-owner");
  });

  it("validate: OWNER can validate any generation; a CONTRIBUTOR can only validate their own", async () => {
    h.clientAssignmentRepository.create(
      ClientAssignment.create({
        id: "assignment-1",
        organizationId: ORG,
        clientAccountId: CLIENT,
        userId: "user-contrib",
        role: ClientRole.Contributor,
        createdBy: "user-owner",
        occurredAt: NOW,
      }),
    );

    const launchedByOwner = await h.launch.execute({
      organizationId: ORG,
      actorId: "user-owner",
      actorRole: "OWNER",
      tenderId: TENDER,
      taskType: GenerationTaskType.ExecutiveSummary,
    });
    const g1 = await h.generationRepository.findById({ organizationId: ORG, generationId: launchedByOwner.id });
    g1!.reserve();
    g1!.markGenerated({ modelProvider: "OPENAI", modelKey: "gpt-4o-mini", fallbackLevel: 0, generatedContent: "x", latencyMs: 1 }, NOW);
    await h.generationRepository.save(g1!);

    // CONTRIBUTOR cannot validate OWNER's generation.
    await expect(
      h.validate.execute({ organizationId: ORG, actorId: "user-contrib", actorRole: "CONTRIBUTOR", generationId: launchedByOwner.id }),
    ).rejects.toThrow();

    // OWNER can validate it.
    const validated = await h.validate.execute({
      organizationId: ORG,
      actorId: "user-owner",
      actorRole: "OWNER",
      generationId: launchedByOwner.id,
    });
    expect(validated.validatedBy).toBe("user-owner");
  });
});
