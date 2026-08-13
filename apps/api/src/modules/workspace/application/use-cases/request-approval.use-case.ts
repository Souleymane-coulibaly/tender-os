import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import { assertEntitlementFeature, ENTITLEMENT_SERVICE, EntitlementFeature, type EntitlementService } from "../../../billing";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { MEMBERSHIP_REPOSITORY, type MembershipRepository } from "../../../memberships";
import { assertHasTenderPermission, CHECKLIST_ITEM_REPOSITORY, GetTenderUseCase, TenderPermission, type ChecklistItemRepository } from "../../../tenders";
import { OUTBOX_WRITER, type OutboxWriter } from "../../../outbox";
import { ApprovalRequest, type ApprovalEntityType } from "../../domain/approval-request.entity";
import { TenderActivityType } from "../../domain/tender-activity-type";
import { ApprovalAutoValidationForbiddenError, ApprovalReviewerNotAuthorizedError } from "../../domain/errors";
import { assertWorkspaceAccess } from "../policies/workspace-authorization.policy";
import { ApprovalTargetResolver, requiredValidatePermissionForApprovalEntityType } from "../services/approval-target-resolver";
import { isActiveTenderParticipant } from "../services/participant-eligibility";
import { ATOMIC_TRANSACTION_RUNNER, type AtomicTransactionRunner } from "../ports/atomic-transaction-runner";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { APPROVAL_REQUEST_REPOSITORY, type ApprovalRequestRepository } from "../ports/approval-request.repository";
import { TASK_REPOSITORY, type TaskRepository } from "../ports/task.repository";
import { TENDER_PARTICIPANT_REPOSITORY, type TenderParticipantRepository } from "../ports/tender-participant.repository";
import { TenderActivityRecorderService } from "../services/tender-activity-recorder.service";
import { toApprovalRequestSummary, type ApprovalRequestSummary } from "../dtos";

export type RequestApprovalCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  actorId: string;
  actorRole: string;
  entityType: ApprovalEntityType;
  entityId: string;
  reviewerId: string;
  comment?: string | undefined;
  requestId?: string | undefined;
}>;

/** V2 Sprint 7 §26-30 — le reviewer doit être un `TenderParticipant` actif ET disposer de
 *  `ClientPermission.ValidateWorkspace` (mission §29, jamais un simple CONTRIBUTOR) ; auto-
 *  validation interdite par défaut (mission §30).
 *
 *  Correctif audit Codex 22A (P1-01) — les circuits de validation (APPROVAL_WORKFLOWS) sont une
 *  fonctionnalité différenciante (Business/Enterprise, mission Sprint 22 §9), gatée après RBAC et
 *  avant toute écriture. */
@Injectable()
export class RequestApprovalUseCase {
  constructor(
    @Inject(APPROVAL_REQUEST_REPOSITORY) private readonly approvalRepository: ApprovalRequestRepository,
    @Inject(TASK_REPOSITORY) private readonly taskRepository: TaskRepository,
    @Inject(CHECKLIST_ITEM_REPOSITORY) private readonly checklistItemRepository: ChecklistItemRepository,
    @Inject(TENDER_PARTICIPANT_REPOSITORY) private readonly participantRepository: TenderParticipantRepository,
    @Inject(MEMBERSHIP_REPOSITORY) private readonly membershipRepository: MembershipRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(ATOMIC_TRANSACTION_RUNNER) private readonly atomicTransactionRunner: AtomicTransactionRunner,
    @Inject(ENTITLEMENT_SERVICE) private readonly entitlementService: EntitlementService,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    private readonly activityRecorder: TenderActivityRecorderService,
    private readonly approvalTargetResolver: ApprovalTargetResolver,
  ) {}

  async execute(command: RequestApprovalCommand): Promise<ApprovalRequestSummary> {
    assertHasTenderPermission(command.actorRole, TenderPermission.ManageWorkspace);
    await assertEntitlementFeature(this.entitlementService, command.organizationId, EntitlementFeature.ApprovalWorkflows, { tenderId: command.tenderId });
    const tender = await assertWorkspaceAccess(this.getTenderUseCase, this.assertClientAccessUseCase, {
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      permission: ClientPermission.ManageWorkspace,
    });

    // V2 Sprint 18 — un résolveur par entityType (mission §26), y compris la vérification
    // d'immuabilité pour les trois cibles documentaires (mission §25 "point critique").
    await this.approvalTargetResolver.assertRequestable(
      { taskRepository: this.taskRepository, checklistItemRepository: this.checklistItemRepository },
      { organizationId: command.organizationId, tenderId: command.tenderId, entityType: command.entityType, entityId: command.entityId },
    );

    if (command.reviewerId === command.actorId) {
      throw new ApprovalAutoValidationForbiddenError();
    }

    const reviewerIsParticipant = await isActiveTenderParticipant(this.participantRepository, {
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      userId: command.reviewerId,
    });
    if (!reviewerIsParticipant) {
      throw new ApprovalReviewerNotAuthorizedError();
    }

    const reviewerMembership = await this.membershipRepository.findByOrganizationAndUser({ organizationId: command.organizationId, userId: command.reviewerId });
    if (!reviewerMembership) {
      throw new ApprovalReviewerNotAuthorizedError();
    }
    try {
      await this.assertClientAccessUseCase.execute({
        organizationId: command.organizationId,
        clientAccountId: tender.clientAccountId,
        actorId: command.reviewerId,
        actorRole: reviewerMembership.role,
        permission: requiredValidatePermissionForApprovalEntityType(command.entityType),
      });
    } catch {
      throw new ApprovalReviewerNotAuthorizedError();
    }

    // Correctif audit Codex P1-02 — sauvegarde + AuditLog + TenderActivity + Outbox dans UNE SEULE
    // transaction Postgres, jamais une demande de validation persistée sans sa trace.
    const approval = await this.atomicTransactionRunner.run(async () => {
      const occurredAt = this.clock.now();
      const approval = ApprovalRequest.create({
        id: this.idGenerator.generate(),
        organizationId: command.organizationId,
        tenderId: command.tenderId,
        entityType: command.entityType,
        entityId: command.entityId,
        requestedBy: command.actorId,
        reviewerId: command.reviewerId,
        comment: command.comment,
        occurredAt,
      });
      await this.approvalRepository.save(approval);

      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorId: command.actorId,
        action: "workspace.approval_requested",
        resourceType: "approval_request",
        resourceId: approval.id,
        requestId: command.requestId,
        metadata: { tenderId: command.tenderId, entityType: command.entityType, entityId: command.entityId, reviewerId: command.reviewerId },
      });

      await this.activityRecorder.record({
        organizationId: command.organizationId,
        tenderId: command.tenderId,
        actorId: command.actorId,
        type: TenderActivityType.ApprovalRequested,
        summary: `Demande de validation créée (${command.entityType.toLowerCase()}).`,
        metadata: { approvalId: approval.id, entityType: command.entityType, entityId: command.entityId },
      });

      await this.outboxWriter.write({
        organizationId: command.organizationId,
        events: [
          {
            eventType: "ApprovalRequested",
            aggregateType: "ApprovalRequest",
            aggregateId: approval.id,
            payload: { tenderId: command.tenderId, entityType: command.entityType, entityId: command.entityId, reviewerId: command.reviewerId },
            occurredAt,
          },
        ],
      });

      return approval;
    });

    return toApprovalRequestSummary(approval);
  }
}
