import { Inject, Injectable } from "@nestjs/common";
import type { DeliverableType } from "../../domain/deliverable-type";
import { DeliverablePermission, roleHasDeliverablePermission } from "../../domain/deliverable-permission";
import { DeliverablePermissionMissingError } from "../../domain/errors";
import { toDeliverableTemplateSummary, type DeliverableTemplateSummary } from "../dtos";
import { DELIVERABLE_TEMPLATE_REPOSITORY, type DeliverableTemplateRepository } from "../ports/deliverable-template.repository";

export type ListDeliverableTemplatesQuery = Readonly<{ organizationId: string; actorRole: string; documentType?: DeliverableType | undefined }>;

/** Mission §17 — la lecture des templates reste réservée à OWNER/ADMIN, comme leur gestion (aucune
 *  capacité "lecture seule des templates" déléguée à un rôle client dans la matrice de permissions). */
@Injectable()
export class ListDeliverableTemplatesUseCase {
  constructor(@Inject(DELIVERABLE_TEMPLATE_REPOSITORY) private readonly repository: DeliverableTemplateRepository) {}

  async execute(query: ListDeliverableTemplatesQuery): Promise<readonly DeliverableTemplateSummary[]> {
    if (!roleHasDeliverablePermission(query.actorRole, DeliverablePermission.ManageDeliverableTemplates)) {
      throw new DeliverablePermissionMissingError();
    }
    const templates = await this.repository.list({ organizationId: query.organizationId, documentType: query.documentType });
    return templates.map(({ template, activeVersion }) => toDeliverableTemplateSummary(template, { activeVersion }));
  }
}
