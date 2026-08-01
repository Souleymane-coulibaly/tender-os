import { Inject, Injectable } from "@nestjs/common";
import { GenerationPermission } from "../../domain/generation-permission";
import { assertHasGenerationPermission } from "../policies/generation-authorization.policy";
import { PromptTemplateNotFoundError } from "../../domain/errors";
import { toPromptTemplateSummary, toPromptVersionSummary, type PromptTemplateSummary, type PromptVersionSummary } from "../dtos";
import { PROMPT_TEMPLATE_REPOSITORY, type PromptTemplateRepository } from "../ports/prompt-template.repository";
import { PROMPT_VERSION_REPOSITORY, type PromptVersionRepository } from "../ports/prompt-version.repository";

export type GetPromptTemplateQuery = Readonly<{ organizationId: string; actorRole: string; templateId: string }>;
export type GetPromptTemplateResult = Readonly<{ template: PromptTemplateSummary; versions: readonly PromptVersionSummary[] }>;

@Injectable()
export class GetPromptTemplateUseCase {
  constructor(
    @Inject(PROMPT_TEMPLATE_REPOSITORY) private readonly promptTemplateRepository: PromptTemplateRepository,
    @Inject(PROMPT_VERSION_REPOSITORY) private readonly promptVersionRepository: PromptVersionRepository,
  ) {}

  async execute(query: GetPromptTemplateQuery): Promise<GetPromptTemplateResult> {
    assertHasGenerationPermission(query.actorRole, GenerationPermission.ReadPromptTemplates);

    const template = await this.promptTemplateRepository.findById({ organizationId: query.organizationId, templateId: query.templateId });
    if (!template) {
      throw new PromptTemplateNotFoundError();
    }

    const versions = await this.promptVersionRepository.listByTemplate({
      organizationId: query.organizationId,
      promptTemplateId: query.templateId,
    });

    return {
      template: toPromptTemplateSummary(template),
      versions: [...versions].sort((a, b) => b.version - a.version).map(toPromptVersionSummary),
    };
  }
}
