import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { GenerationPermission } from "../../domain/generation-permission";
import { assertHasGenerationPermission } from "../policies/generation-authorization.policy";
import { PromptTemplate } from "../../domain/prompt-template.aggregate";
import { DuplicatePromptTemplateError } from "../../domain/errors";
import type { GenerationOutputMode } from "../../domain/generation-output-mode";
import type { GenerationTaskType } from "../../domain/generation-task-type";
import { toPromptTemplateSummary, type PromptTemplateSummary } from "../dtos";
import { PROMPT_TEMPLATE_REPOSITORY, type PromptTemplateRepository } from "../ports/prompt-template.repository";

export type CreatePromptTemplateCommand = Readonly<{
  organizationId: string;
  actorRole: string;
  createdBy: string;
  taskType: GenerationTaskType;
  name: string;
  description?: string | undefined;
  outputMode: GenerationOutputMode;
  structuredSchemaKey?: string | undefined;
}>;

@Injectable()
export class CreatePromptTemplateUseCase {
  constructor(
    @Inject(PROMPT_TEMPLATE_REPOSITORY) private readonly promptTemplateRepository: PromptTemplateRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: CreatePromptTemplateCommand): Promise<PromptTemplateSummary> {
    assertHasGenerationPermission(command.actorRole, GenerationPermission.ManagePromptTemplates);

    const existing = await this.promptTemplateRepository.findByTaskType({
      organizationId: command.organizationId,
      taskType: command.taskType,
    });
    if (existing) {
      throw new DuplicatePromptTemplateError();
    }

    const occurredAt = this.clock.now();
    const template = PromptTemplate.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      taskType: command.taskType,
      name: command.name,
      description: command.description,
      outputMode: command.outputMode,
      structuredSchemaKey: command.structuredSchemaKey,
      createdBy: command.createdBy,
      occurredAt,
    });

    await this.promptTemplateRepository.create(template);

    return toPromptTemplateSummary(template);
  }
}
