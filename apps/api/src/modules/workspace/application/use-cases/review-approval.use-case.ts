import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GetTenderUseCase } from "../../../tenders";
import { OUTBOX_WRITER, type OutboxWriter } from "../../../outbox";
import { TenderActivityType } from "../../domain/tender-activity-type";
import { ApprovalRequestNotFoundError, ApprovalReviewerNotAuthorizedError } from "../../domain/errors";
import { assertWorkspaceAccess } from "../policies/workspace-authorization.policy";
import { ATOMIC_TRANSACTION_RUNNER, type AtomicTransactionRunner } from "../ports/atomic-transaction-runner";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { APPROVAL_REQUEST_REPOSITORY, type ApprovalRequestRepository } from "../ports/approval-request.repository";
import { TenderActivityRecorderService } from "../services/tender-activity-recorder.service";
import { toApprovalRequestSummary, type ApprovalRequestSummary } from "../dtos";

export type ReviewApprovalCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  approvalId: string;
  actorId: string;
  actorRole: string;
  comment?: string | undefined;
  requestId?: string | undefined;
}>;

async function loadApproval(repository: ApprovalRequestRepository, input: { organizationId: string; tenderId: string; approvalId: string }) {
  const approval = await repository.findById(input);
  if (!approval) {
    throw new ApprovalRequestNotFoundError();
  }
  return approval;
}

/** V2 Sprint 7 §26-30/§48 — seul le reviewer DÉSIGNÉ à la demande peut approuver/demander des
 *  modifications (mission §29), jamais un autre CONTRIBUTOR disposant simplement de
 *  `ValidateWorkspace`. L'idempotence est portée par le domaine (`ApprovalRequest.assertPending`) :
 *  une seconde revue concurrente échoue proprement (`ApprovalRequestAlreadyReviewedError`, mission
 *  §48 "double approval"), jamais une écriture silencieusement écrasée. */
@Injectable()
export class ApproveApprovalUseCase {
  constructor(
    @Inject(APPROVAL_REQUEST_REPOSITORY) private readonly approvalRepository: ApprovalRequestRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ATOMIC_TRANSACTION_RUNNER) private readonly atomicTransactionRunner: AtomicTransactionRunner,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    private readonly activityRecorder: TenderActivityRecorderService,
  ) {}

  async execute(command: ReviewApprovalCommand): Promise<ApprovalRequestSummary> {
    await assertWorkspaceAccess(this.getTenderUseCase, this.assertClientAccessUseCase, {
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      permission: ClientPermission.ValidateWorkspace,
    });

    // Vérification d'autorisation rapide, hors verrou (le reviewerId ne change jamais une fois la
    // demande créée — aucun TOCTOU possible sur cette seule lecture).
    const preliminary = await loadApproval(this.approvalRepository, { organizationId: command.organizationId, tenderId: command.tenderId, approvalId: command.approvalId });
    if (preliminary.reviewerId !== command.actorId) {
      throw new ApprovalReviewerNotAuthorizedError();
    }

    // Correctif audit Codex P1-02 — `atomicTransactionRunner.run` ouvre la transaction ambiante ;
    // `reviewLocked` (verrou + lecture fraîche + décision + écriture, mission §48) la rejoint
    // automatiquement via `PrismaService.withTransaction`, tout comme AuditLog/TenderActivity/
    // Outbox : un seul COMMIT, rollback total si une étape échoue.
    const approval = await this.atomicTransactionRunner.run(async () => {
      const occurredAt = this.clock.now();
      const approval = await this.approvalRepository.reviewLocked(
        { organizationId: command.organizationId, tenderId: command.tenderId, approvalId: command.approvalId },
        (a) => a.approve(command.comment, occurredAt),
      );

      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorId: command.actorId,
        action: "workspace.approval_approved",
        resourceType: "approval_request",
        resourceId: approval.id,
        requestId: command.requestId,
        metadata: { tenderId: command.tenderId, entityType: approval.entityType, entityId: approval.entityId },
      });

      await this.activityRecorder.record({
        organizationId: command.organizationId,
        tenderId: command.tenderId,
        actorId: command.actorId,
        type: TenderActivityType.ApprovalApproved,
        summary: `Demande de validation approuvée (${approval.entityType.toLowerCase()}).`,
        metadata: { approvalId: approval.id },
      });

      await this.outboxWriter.write({
        organizationId: command.organizationId,
        events: [
          {
            eventType: "ApprovalApproved",
            aggregateType: "ApprovalRequest",
            aggregateId: approval.id,
            payload: { tenderId: command.tenderId, entityType: approval.entityType, entityId: approval.entityId },
            occurredAt,
          },
        ],
      });

      return approval;
    });

    return toApprovalRequestSummary(approval);
  }
}

@Injectable()
export class RequestApprovalChangesUseCase {
  constructor(
    @Inject(APPROVAL_REQUEST_REPOSITORY) private readonly approvalRepository: ApprovalRequestRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ATOMIC_TRANSACTION_RUNNER) private readonly atomicTransactionRunner: AtomicTransactionRunner,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    private readonly activityRecorder: TenderActivityRecorderService,
  ) {}

  async execute(command: ReviewApprovalCommand): Promise<ApprovalRequestSummary> {
    await assertWorkspaceAccess(this.getTenderUseCase, this.assertClientAccessUseCase, {
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      permission: ClientPermission.ValidateWorkspace,
    });

    const preliminary = await loadApproval(this.approvalRepository, { organizationId: command.organizationId, tenderId: command.tenderId, approvalId: command.approvalId });
    if (preliminary.reviewerId !== command.actorId) {
      throw new ApprovalReviewerNotAuthorizedError();
    }

    // Correctif audit Codex P1-02 (voir ApproveApprovalUseCase ci-dessus pour la justification
    // complète).
    const approval = await this.atomicTransactionRunner.run(async () => {
      const occurredAt = this.clock.now();
      const approval = await this.approvalRepository.reviewLocked(
        { organizationId: command.organizationId, tenderId: command.tenderId, approvalId: command.approvalId },
        (a) => a.requestChanges(command.comment, occurredAt),
      );

      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorId: command.actorId,
        action: "workspace.approval_changes_requested",
        resourceType: "approval_request",
        resourceId: approval.id,
        requestId: command.requestId,
        metadata: { tenderId: command.tenderId, entityType: approval.entityType, entityId: approval.entityId },
      });

      await this.activityRecorder.record({
        organizationId: command.organizationId,
        tenderId: command.tenderId,
        actorId: command.actorId,
        type: TenderActivityType.ApprovalChangesRequested,
        summary: `Modifications demandées (${approval.entityType.toLowerCase()}).`,
        metadata: { approvalId: approval.id },
      });

      await this.outboxWriter.write({
        organizationId: command.organizationId,
        events: [
          {
            eventType: "ApprovalChangesRequested",
            aggregateType: "ApprovalRequest",
            aggregateId: approval.id,
            payload: { tenderId: command.tenderId, entityType: approval.entityType, entityId: approval.entityId },
            occurredAt,
          },
        ],
      });

      return approval;
    });

    return toApprovalRequestSummary(approval);
  }
}
