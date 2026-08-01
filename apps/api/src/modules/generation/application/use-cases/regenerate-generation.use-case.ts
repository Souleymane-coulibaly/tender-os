import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GenerationAlreadyRunningError, GenerationNotFoundError, NoActivePromptVersionError } from "../../domain/errors";
import { Generation } from "../../domain/generation.aggregate";
import { toGenerationSummary, type GenerationSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { GENERATION_DISPATCHER, type GenerationDispatcher } from "../ports/generation-dispatcher";
import { GENERATION_REPOSITORY, type GenerationRepository } from "../ports/generation.repository";
import { PROMPT_VERSION_REPOSITORY, type PromptVersionRepository } from "../ports/prompt-version.repository";

export type RegenerateGenerationCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  generationId: string;
  requestId?: string | undefined;
}>;

/**
 * Crée une NOUVELLE version sous le même `rootGenerationId` — ne remplace ni ne modifie jamais la
 * ligne existante (mission §"ne remplace jamais silencieusement une ancienne génération"). Utilise
 * la version de prompt ACTIVE au moment de la régénération (peut différer de celle de la version
 * précédente si un administrateur a activé une nouvelle version entretemps) — chaque génération
 * fige sa propre version au moment de sa propre création, jamais recalculée après coup.
 */
@Injectable()
export class RegenerateGenerationUseCase {
  constructor(
    @Inject(GENERATION_REPOSITORY) private readonly generationRepository: GenerationRepository,
    @Inject(PROMPT_VERSION_REPOSITORY) private readonly promptVersionRepository: PromptVersionRepository,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    @Inject(GENERATION_DISPATCHER) private readonly dispatcher: GenerationDispatcher,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: RegenerateGenerationCommand): Promise<GenerationSummary> {
    const previous = await this.generationRepository.findById({
      organizationId: command.organizationId,
      generationId: command.generationId,
    });
    if (!previous) {
      throw new GenerationNotFoundError();
    }

    await this.assertClientAccessUseCase.execute({
      organizationId: command.organizationId,
      clientAccountId: previous.clientAccountId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      permission: ClientPermission.ManageGeneration,
    });

    const inFlight = await this.generationRepository.findInFlightForTarget({
      organizationId: command.organizationId,
      tenderId: previous.tenderId,
      taskType: previous.taskType,
      targetRef: previous.targetRef,
    });
    if (inFlight) {
      throw new GenerationAlreadyRunningError();
    }

    const activeVersion = await this.promptVersionRepository.findActive({
      organizationId: command.organizationId,
      promptTemplateId: previous.promptTemplateId,
    });
    if (!activeVersion) {
      throw new NoActivePromptVersionError();
    }

    const siblings = await this.generationRepository.findByRoot({
      organizationId: command.organizationId,
      rootGenerationId: previous.rootGenerationId,
    });
    const nextVersionNumber = Math.max(...siblings.map((g) => g.version)) + 1;

    const occurredAt = this.clock.now();
    const newGeneration = Generation.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      clientAccountId: previous.clientAccountId,
      tenderId: previous.tenderId,
      taskType: previous.taskType,
      targetRef: previous.targetRef,
      parentGenerationId: previous.rootGenerationId,
      rootGenerationId: previous.rootGenerationId,
      version: nextVersionNumber,
      promptTemplateId: previous.promptTemplateId,
      promptVersionId: activeVersion.id,
      promptVersionNumber: activeVersion.version,
      createdBy: command.actorId,
      createdByRole: command.actorRole,
      occurredAt,
    });

    await this.generationRepository.create(newGeneration);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "generation.regenerated",
      resourceType: "generation",
      resourceId: newGeneration.id,
      requestId: command.requestId,
      metadata: { rootGenerationId: previous.rootGenerationId, version: nextVersionNumber },
    });

    this.dispatcher.dispatch({ organizationId: command.organizationId, generationId: newGeneration.id, requestId: command.requestId });

    return toGenerationSummary(newGeneration, { canSeeCost: false });
  }
}
