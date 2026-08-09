import { Inject, Injectable } from "@nestjs/common";
import { DocumentGenerationPermission, roleHasDocumentGenerationPermission } from "../../domain/document-generation-permission";
import { DocumentGenerationPermissionMissingError } from "../../domain/errors";
import { toDocumentTemplateSummary, type DocumentTemplateSummary } from "../dtos";
import { DOCUMENT_TEMPLATE_REPOSITORY, type DocumentTemplateRepository } from "../ports/document-template.repository";

export type ListDocumentTemplatesQuery = Readonly<{ organizationId: string; actorRole: string }>;

@Injectable()
export class ListDocumentTemplatesUseCase {
  constructor(@Inject(DOCUMENT_TEMPLATE_REPOSITORY) private readonly templateRepository: DocumentTemplateRepository) {}

  async execute(query: ListDocumentTemplatesQuery): Promise<readonly DocumentTemplateSummary[]> {
    if (!roleHasDocumentGenerationPermission(query.actorRole, DocumentGenerationPermission.ReadTemplates)) {
      throw new DocumentGenerationPermissionMissingError();
    }

    const templates = await this.templateRepository.list({ organizationId: query.organizationId });
    return templates.map(({ template, activeVersion }) => toDocumentTemplateSummary(template, activeVersion));
  }
}
