import { Inject, Injectable } from "@nestjs/common";
import { DocumentGenerationPermission, roleHasDocumentGenerationPermission } from "../../domain/document-generation-permission";
import { DocumentGenerationPermissionMissingError, DocumentTemplateNotFoundError } from "../../domain/errors";
import { toDocumentTemplateSummary, toDocumentTemplateVersionSummary, type DocumentTemplateSummary, type DocumentTemplateVersionSummary } from "../dtos";
import { DOCUMENT_TEMPLATE_REPOSITORY, type DocumentTemplateRepository } from "../ports/document-template.repository";

export type GetDocumentTemplateQuery = Readonly<{ organizationId: string; actorRole: string; documentTemplateId: string }>;

export type DocumentTemplateDetail = DocumentTemplateSummary & { versions: readonly DocumentTemplateVersionSummary[] };

@Injectable()
export class GetDocumentTemplateUseCase {
  constructor(@Inject(DOCUMENT_TEMPLATE_REPOSITORY) private readonly templateRepository: DocumentTemplateRepository) {}

  async execute(query: GetDocumentTemplateQuery): Promise<DocumentTemplateDetail> {
    if (!roleHasDocumentGenerationPermission(query.actorRole, DocumentGenerationPermission.ReadTemplates)) {
      throw new DocumentGenerationPermissionMissingError();
    }

    const found = await this.templateRepository.findById({ organizationId: query.organizationId, documentTemplateId: query.documentTemplateId });
    if (!found) {
      throw new DocumentTemplateNotFoundError();
    }

    const versions = await this.templateRepository.listVersions({ organizationId: query.organizationId, documentTemplateId: query.documentTemplateId });

    return { ...toDocumentTemplateSummary(found.template, found.activeVersion), versions: versions.map(toDocumentTemplateVersionSummary) };
  }
}
