import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { GenerationPermission } from "../../domain/generation-permission";
import { assertHasGenerationPermission } from "../policies/generation-authorization.policy";
import { PromptTemplateArchivedError, PromptTemplateNotFoundError } from "../../domain/errors";
import { PromptVersion } from "../../domain/prompt-version.entity";
import { toPromptVersionSummary, type PromptVersionSummary } from "../dtos";
import { PROMPT_TEMPLATE_REPOSITORY, type PromptTemplateRepository } from "../ports/prompt-template.repository";
import { PROMPT_VERSION_REPOSITORY, type PromptVersionRepository } from "../ports/prompt-version.repository";

export type CreatePromptVersionCommand = Readonly<{
  organizationId: string;
  actorRole: string;
  authorUserId: string;
  promptTemplateId: string;
  systemPrompt: string;
  userPromptTemplate: string;
  requiredVariables: readonly string[];
}>;

@Injectable()
export class CreatePromptVersionUseCase {
  constructor(
    @Inject(PROMPT_TEMPLATE_REPOSITORY) private readonly promptTemplateRepository: PromptTemplateRepository,
    @Inject(PROMPT_VERSION_REPOSITORY) private readonly promptVersionRepository: PromptVersionRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: CreatePromptVersionCommand): Promise<PromptVersionSummary> {
    assertHasGenerationPermission(command.actorRole, GenerationPermission.ManagePromptTemplates);

    const template = await this.promptTemplateRepository.findById({
      organizationId: command.organizationId,
      templateId: command.promptTemplateId,
    });
    if (!template) {
      throw new PromptTemplateNotFoundError();
    }
    if (template.archivedAt) {
      throw new PromptTemplateArchivedError();
    }

    const nextVersion = await this.promptVersionRepository.nextVersionNumber({
      organizationId: command.organizationId,
      promptTemplateId: command.promptTemplateId,
    });

    const version = PromptVersion.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      promptTemplateId: command.promptTemplateId,
      version: nextVersion,
      systemPrompt: command.systemPrompt,
      userPromptTemplate: command.userPromptTemplate,
      requiredVariables: command.requiredVariables,
      authorUserId: command.authorUserId,
      occurredAt: this.clock.now(),
    });

    await this.promptVersionRepository.create(version);

    return toPromptVersionSummary(version);
  }
}
