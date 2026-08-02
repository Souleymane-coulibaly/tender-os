import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GetTenderUseCase } from "../../../tenders";
import { DeliverableComment } from "../../domain/deliverable-comment.entity";
import { DeliverableNotFoundError } from "../../domain/errors";
import { toDeliverableCommentSummary, type DeliverableCommentSummary } from "../dtos";
import { DELIVERABLE_REPOSITORY, type DeliverableRepository } from "../ports/deliverable.repository";
import { DELIVERABLE_COMMENT_REPOSITORY, type DeliverableCommentRepository } from "../ports/deliverable-comment.repository";

export type AddDeliverableCommentCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  deliverableId: string;
  deliverableSectionId?: string | undefined;
  deliverableRevisionId?: string | undefined;
  content: string;
}>;

/** Mission Sprint 8A.1 §13 — commentaire simple, lié à un livrable, éventuellement une section/une
 *  révision — "le workflow collaboratif avancé reste réservé au Sprint 11". */
@Injectable()
export class AddDeliverableCommentUseCase {
  constructor(
    @Inject(DELIVERABLE_REPOSITORY) private readonly deliverableRepository: DeliverableRepository,
    @Inject(DELIVERABLE_COMMENT_REPOSITORY) private readonly commentRepository: DeliverableCommentRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: AddDeliverableCommentCommand): Promise<DeliverableCommentSummary> {
    const deliverable = await this.deliverableRepository.findById({ organizationId: command.organizationId, deliverableId: command.deliverableId });
    if (!deliverable) {
      throw new DeliverableNotFoundError();
    }
    const tender = await this.getTenderUseCase.execute({
      organizationId: command.organizationId,
      tenderId: deliverable.tenderId,
      actorId: command.actorId,
      actorRole: command.actorRole,
    });
    await this.assertClientAccessUseCase.execute({
      organizationId: command.organizationId,
      clientAccountId: tender.clientAccountId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      permission: ClientPermission.ManageDeliverable,
    });

    const comment = DeliverableComment.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      deliverableId: command.deliverableId,
      deliverableSectionId: command.deliverableSectionId,
      deliverableRevisionId: command.deliverableRevisionId,
      content: command.content,
      authorId: command.actorId,
      occurredAt: this.clock.now(),
    });

    await this.commentRepository.create(comment);
    return toDeliverableCommentSummary(comment);
  }
}
