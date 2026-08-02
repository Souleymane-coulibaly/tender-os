import { Inject, Injectable } from "@nestjs/common";
import { ClientPermission } from "../../../client-portfolio";
import { toDeliverableRevisionSummary, type DeliverableRevisionSummary } from "../dtos";
import { DELIVERABLE_REVISION_REPOSITORY, type DeliverableRevisionRepository } from "../ports/deliverable-revision.repository";
import { DeliverableAccessService } from "../services/deliverable-access.service";

export type ListSectionRevisionsQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; deliverableSectionId: string }>;

/** Mission Sprint 8A.1 §4/§9 — historique complet des révisions d'une section, plus récente
 *  d'abord — jamais filtré : "une ancienne révision ne doit jamais être écrasée" implique qu'elle
 *  reste toujours consultable. */
@Injectable()
export class ListSectionRevisionsUseCase {
  constructor(
    private readonly accessService: DeliverableAccessService,
    @Inject(DELIVERABLE_REVISION_REPOSITORY) private readonly revisionRepository: DeliverableRevisionRepository,
  ) {}

  async execute(query: ListSectionRevisionsQuery): Promise<readonly DeliverableRevisionSummary[]> {
    const { section } = await this.accessService.loadSectionContext({
      organizationId: query.organizationId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      deliverableSectionId: query.deliverableSectionId,
      permission: ClientPermission.ReadDeliverable,
    });
    const revisions = await this.revisionRepository.listBySection({ organizationId: query.organizationId, deliverableSectionId: section.id });
    return revisions.map(toDeliverableRevisionSummary);
  }
}
