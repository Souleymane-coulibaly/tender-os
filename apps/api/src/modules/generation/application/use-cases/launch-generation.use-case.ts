import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GetTenderUseCase } from "../../../tenders";
import { GenerationAlreadyRunningError, NoActivePromptVersionError, PromptTemplateNotFoundError } from "../../domain/errors";
import { Generation } from "../../domain/generation.aggregate";
import type { GenerationTaskType } from "../../domain/generation-task-type";
import { toGenerationSummary, type GenerationSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { GENERATION_DISPATCHER, type GenerationDispatcher } from "../ports/generation-dispatcher";
import { GENERATION_REPOSITORY, type GenerationRepository } from "../ports/generation.repository";
import { PROMPT_TEMPLATE_REPOSITORY, type PromptTemplateRepository } from "../ports/prompt-template.repository";
import { PROMPT_VERSION_REPOSITORY, type PromptVersionRepository } from "../ports/prompt-version.repository";

export type LaunchGenerationCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  tenderId: string;
  taskType: GenerationTaskType;
  targetRef?: string | undefined;
  requestId?: string | undefined;
}>;

/**
 * Lance une génération (mission Sprint 6 §"génération d'un contenu") — jamais un modèle choisi par
 * le frontend : le `taskType` est le seul signal fourni par l'appelant, la version active du
 * prompt et le modèle sont résolus ENTIÈREMENT côté backend (voir `ProcessGenerationUseCase`).
 * Double garde-fou "double génération" : vérification applicative ici (première ligne de défense),
 * index unique partiel `generations_org_tender_tasktype_target_inflight_key` (migration) en filet
 * de sécurité de dernier recours contre une course de concurrence.
 */
@Injectable()
export class LaunchGenerationUseCase {
  constructor(
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    @Inject(PROMPT_TEMPLATE_REPOSITORY) private readonly promptTemplateRepository: PromptTemplateRepository,
    @Inject(PROMPT_VERSION_REPOSITORY) private readonly promptVersionRepository: PromptVersionRepository,
    @Inject(GENERATION_REPOSITORY) private readonly generationRepository: GenerationRepository,
    @Inject(GENERATION_DISPATCHER) private readonly dispatcher: GenerationDispatcher,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: LaunchGenerationCommand): Promise<GenerationSummary> {
    const tender = await this.getTenderUseCase.execute({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      actorRole: command.actorRole,
      actorId: command.actorId,
    });

    await this.assertClientAccessUseCase.execute({
      organizationId: command.organizationId,
      clientAccountId: tender.clientAccountId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      permission: ClientPermission.ManageGeneration,
    });

    const inFlight = await this.generationRepository.findInFlightForTarget({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      taskType: command.taskType,
      targetRef: command.targetRef,
    });
    if (inFlight) {
      throw new GenerationAlreadyRunningError();
    }

    const template = await this.promptTemplateRepository.findByTaskType({
      organizationId: command.organizationId,
      taskType: command.taskType,
    });
    if (!template) {
      throw new PromptTemplateNotFoundError();
    }

    const activeVersion = await this.promptVersionRepository.findActive({
      organizationId: command.organizationId,
      promptTemplateId: template.id,
    });
    if (!activeVersion) {
      throw new NoActivePromptVersionError();
    }

    const occurredAt = this.clock.now();
    const id = this.idGenerator.generate();
    const generation = Generation.create({
      id,
      organizationId: command.organizationId,
      clientAccountId: tender.clientAccountId,
      tenderId: command.tenderId,
      taskType: command.taskType,
      targetRef: command.targetRef,
      rootGenerationId: id,
      version: 1,
      promptTemplateId: template.id,
      promptVersionId: activeVersion.id,
      promptVersionNumber: activeVersion.version,
      createdBy: command.actorId,
      createdByRole: command.actorRole,
      occurredAt,
    });

    await this.generationRepository.create(generation);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "generation.launched",
      resourceType: "generation",
      resourceId: generation.id,
      requestId: command.requestId,
      metadata: { taskType: command.taskType, tenderId: command.tenderId },
    });

    this.dispatcher.dispatch({ organizationId: command.organizationId, generationId: generation.id, requestId: command.requestId });

    return toGenerationSummary(generation, { canSeeCost: false });
  }
}
