import { Inject, Injectable } from "@nestjs/common";
import { GenerationPermission } from "../../domain/generation-permission";
import { assertHasGenerationPermission } from "../policies/generation-authorization.policy";
import { toPromptTemplateSummary, type PromptTemplateSummary } from "../dtos";
import { PROMPT_TEMPLATE_REPOSITORY, type PromptTemplateRepository } from "../ports/prompt-template.repository";

export type ListPromptTemplatesQuery = Readonly<{ organizationId: string; actorRole: string; includeArchived?: boolean | undefined }>;

@Injectable()
export class ListPromptTemplatesUseCase {
  constructor(@Inject(PROMPT_TEMPLATE_REPOSITORY) private readonly promptTemplateRepository: PromptTemplateRepository) {}

  async execute(query: ListPromptTemplatesQuery): Promise<readonly PromptTemplateSummary[]> {
    assertHasGenerationPermission(query.actorRole, GenerationPermission.ReadPromptTemplates);

    const templates = await this.promptTemplateRepository.list({
      organizationId: query.organizationId,
      includeArchived: query.includeArchived ?? false,
    });

    return templates.map(toPromptTemplateSummary);
  }
}
