import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GetTenderUseCase } from "../../../tenders";
import { DeliverableNotFoundError } from "../../domain/errors";
import { toDeliverableSummary, type DeliverableSummary } from "../dtos";
import { DELIVERABLE_REPOSITORY, type DeliverableRepository } from "../ports/deliverable.repository";
import { DELIVERABLE_SECTION_REPOSITORY, type DeliverableSectionRepository } from "../ports/deliverable-section.repository";

export type GetDeliverableQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; deliverableId: string }>;

@Injectable()
export class GetDeliverableUseCase {
  constructor(
    @Inject(DELIVERABLE_REPOSITORY) private readonly deliverableRepository: DeliverableRepository,
    @Inject(DELIVERABLE_SECTION_REPOSITORY) private readonly sectionRepository: DeliverableSectionRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(query: GetDeliverableQuery): Promise<DeliverableSummary> {
    const deliverable = await this.deliverableRepository.findById({ organizationId: query.organizationId, deliverableId: query.deliverableId });
    if (!deliverable) {
      throw new DeliverableNotFoundError();
    }

    // Mission §19 — jamais s'appuyer sur `deliverable.clientAccountId` seul pour l'autorisation :
    // revérifie l'accès via le Tender (même chaîne que Export/Validation).
    const tender = await this.getTenderUseCase.execute({
      organizationId: query.organizationId,
      tenderId: deliverable.tenderId,
      actorId: query.actorId,
      actorRole: query.actorRole,
    });
    await this.assertClientAccessUseCase.execute({
      organizationId: query.organizationId,
      clientAccountId: tender.clientAccountId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      permission: ClientPermission.ReadDeliverable,
    });

    const sections = await this.sectionRepository.listByDeliverable({ organizationId: query.organizationId, deliverableId: deliverable.id });
    return toDeliverableSummary(deliverable, { sections: [...sections].sort((a, b) => a.order - b.order) });
  }
}
