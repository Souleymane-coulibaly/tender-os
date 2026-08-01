import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { GenerationPermission } from "../../domain/generation-permission";
import { assertHasGenerationPermission } from "../policies/generation-authorization.policy";
import { PromptTemplateNotFoundError } from "../../domain/errors";
import { toPromptTemplateSummary, type PromptTemplateSummary } from "../dtos";
import { PROMPT_TEMPLATE_REPOSITORY, type PromptTemplateRepository } from "../ports/prompt-template.repository";

export type ArchivePromptTemplateCommand = Readonly<{
  organizationId: string;
  actorRole: string;
  templateId: string;
}>;

@Injectable()
export class ArchivePromptTemplateUseCase {
  constructor(
    @Inject(PROMPT_TEMPLATE_REPOSITORY) private readonly promptTemplateRepository: PromptTemplateRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: ArchivePromptTemplateCommand): Promise<PromptTemplateSummary> {
    assertHasGenerationPermission(command.actorRole, GenerationPermission.ManagePromptTemplates);

    const template = await this.promptTemplateRepository.findById({ organizationId: command.organizationId, templateId: command.templateId });
    if (!template) {
      throw new PromptTemplateNotFoundError();
    }

    template.archive(this.clock.now());
    await this.promptTemplateRepository.save(template);

    return toPromptTemplateSummary(template);
  }
}
