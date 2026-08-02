import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GetTenderUseCase } from "../../../tenders";
import { DeliverableCommentNotFoundError, DeliverableNotFoundError } from "../../domain/errors";
import { toDeliverableCommentSummary, type DeliverableCommentSummary } from "../dtos";
import { DELIVERABLE_REPOSITORY, type DeliverableRepository } from "../ports/deliverable.repository";
import { DELIVERABLE_COMMENT_REPOSITORY, type DeliverableCommentRepository } from "../ports/deliverable-comment.repository";

export type ResolveDeliverableCommentCommand = Readonly<{ organizationId: string; actorId: string; actorRole: string; deliverableId: string; commentId: string }>;

@Injectable()
export class ResolveDeliverableCommentUseCase {
  constructor(
    @Inject(DELIVERABLE_REPOSITORY) private readonly deliverableRepository: DeliverableRepository,
    @Inject(DELIVERABLE_COMMENT_REPOSITORY) private readonly commentRepository: DeliverableCommentRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: ResolveDeliverableCommentCommand): Promise<DeliverableCommentSummary> {
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

    const comment = await this.commentRepository.findById({ organizationId: command.organizationId, commentId: command.commentId });
    if (!comment || comment.deliverableId !== command.deliverableId) {
      throw new DeliverableCommentNotFoundError();
    }
    comment.resolve({ resolvedBy: command.actorId, occurredAt: this.clock.now() });
    await this.commentRepository.save(comment);
    return toDeliverableCommentSummary(comment);
  }
}
