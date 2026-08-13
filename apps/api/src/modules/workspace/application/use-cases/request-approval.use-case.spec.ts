import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChecklistItemRepository, GetTenderUseCase } from "../../../tenders";
import { OrganizationMembership } from "../../../memberships";
import { MembershipId } from "../../../memberships/domain/membership-id.value-object";
import { ApprovalEntityType } from "../../domain/approval-request.entity";
import { ApprovalAutoValidationForbiddenError, ApprovalReviewerNotAuthorizedError } from "../../domain/errors";
import { Task } from "../../domain/task.entity";
import { TenderCollaborativeRole, TenderParticipant } from "../../domain/tender-participant.entity";
import {
  FakeAtomicTransactionRunner,
  FixedClock,
  InMemoryApprovalRequestRepository,
  InMemoryAuditLogWriter,
  InMemoryTaskRepository,
  InMemoryTenderActivityRepository,
  InMemoryTenderParticipantRepository,
  SequentialIdGenerator,
  FakeOutboxWriter,
} from "../../test-support/fakes";
import { ApprovalTargetResolver } from "../services/approval-target-resolver";
import { TenderActivityRecorderService } from "../services/tender-activity-recorder.service";
import { RequestApprovalUseCase } from "./request-approval.use-case";

describe("RequestApprovalUseCase", () => {
  let approvalRepository: InMemoryApprovalRequestRepository;
  let taskRepository: InMemoryTaskRepository;
  let participantRepository: InMemoryTenderParticipantRepository;
  let membershipRepository: { findByOrganizationAndUser: ReturnType<typeof vi.fn> };
  let getTenderUseCase: { execute: ReturnType<typeof vi.fn> };
  let assertClientAccessUseCase: { execute: ReturnType<typeof vi.fn> };
  let entitlementService: { canUseFeature: ReturnType<typeof vi.fn>; getEffectivePlanTier: ReturnType<typeof vi.fn>; canOperateOnTender: ReturnType<typeof vi.fn>; getEffectiveLimit: ReturnType<typeof vi.fn> };
  let useCase: RequestApprovalUseCase;

  beforeEach(async () => {
    approvalRepository = new InMemoryApprovalRequestRepository();
    taskRepository = new InMemoryTaskRepository();
    participantRepository = new InMemoryTenderParticipantRepository();
    getTenderUseCase = { execute: vi.fn(async () => ({ id: "tender-1", clientAccountId: "client-1" })) };
    assertClientAccessUseCase = { execute: vi.fn(async () => {}) };

    await taskRepository.save(Task.create({ id: "task-1", organizationId: "org-1", tenderId: "tender-1", title: "Mémoire technique", createdBy: "user-1", occurredAt: new Date() }));
    await participantRepository.save(
      TenderParticipant.create({ id: "p-1", organizationId: "org-1", tenderId: "tender-1", userId: "reviewer-1", role: TenderCollaborativeRole.Reviewer, addedBy: "user-1", occurredAt: new Date() }),
    );
    membershipRepository = {
      findByOrganizationAndUser: vi.fn(async () =>
        OrganizationMembership.create({ id: MembershipId.from("m-1"), organizationId: "org-1", userId: "reviewer-1", role: "BID_MANAGER", occurredAt: new Date() }),
      ),
    };

    const activityRecorder = new TenderActivityRecorderService(new InMemoryTenderActivityRepository(), new FixedClock(), new SequentialIdGenerator());
    entitlementService = { canUseFeature: vi.fn(async () => true), getEffectivePlanTier: vi.fn(), canOperateOnTender: vi.fn(), getEffectiveLimit: vi.fn() };

    useCase = new RequestApprovalUseCase(
      approvalRepository,
      taskRepository,
      {} as unknown as ChecklistItemRepository,
      participantRepository,
      membershipRepository as never,
      new InMemoryAuditLogWriter(),
      new FakeOutboxWriter() as never,
      new FixedClock(),
      new SequentialIdGenerator(),
      new FakeAtomicTransactionRunner(),
      entitlementService as never,
      getTenderUseCase as unknown as GetTenderUseCase,
      assertClientAccessUseCase as never,
      activityRecorder,
      // Les 3 dépendances cross-module ne sont jamais invoquées pour TASK/CHECKLIST_ITEM (seules
      // cibles exercées par ces tests) — même motif que `{} as unknown as ChecklistItemRepository`
      // ci-dessus.
      new ApprovalTargetResolver(undefined as never, undefined as never, undefined as never),
    );
  });

  it("creates a PENDING approval request for an eligible reviewer", async () => {
    const result = await useCase.execute({
      organizationId: "org-1",
      tenderId: "tender-1",
      actorId: "user-1",
      actorRole: "BID_MANAGER",
      entityType: ApprovalEntityType.Task,
      entityId: "task-1",
      reviewerId: "reviewer-1",
    });

    expect(result.status).toBe("PENDING");
    expect(result.reviewerId).toBe("reviewer-1");
  });

  it("rejects auto-validation (requestedBy === reviewerId), mission §30", async () => {
    await expect(
      useCase.execute({ organizationId: "org-1", tenderId: "tender-1", actorId: "user-1", actorRole: "BID_MANAGER", entityType: ApprovalEntityType.Task, entityId: "task-1", reviewerId: "user-1" }),
    ).rejects.toBeInstanceOf(ApprovalAutoValidationForbiddenError);
  });

  it("rejects a reviewer who is not an active participant of this Tender", async () => {
    await expect(
      useCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        actorId: "user-1",
        actorRole: "BID_MANAGER",
        entityType: ApprovalEntityType.Task,
        entityId: "task-1",
        reviewerId: "not-a-participant",
      }),
    ).rejects.toBeInstanceOf(ApprovalReviewerNotAuthorizedError);
  });

  it("correctif audit Codex 22A (P1-01) — refuses when the organization's plan does not include APPROVAL_WORKFLOWS (e.g. Starter)", async () => {
    const { EntitlementFeatureNotAvailableError } = await import("../../../billing");
    entitlementService.canUseFeature = vi.fn(async () => false);

    await expect(
      useCase.execute({ organizationId: "org-1", tenderId: "tender-1", actorId: "user-1", actorRole: "BID_MANAGER", entityType: ApprovalEntityType.Task, entityId: "task-1", reviewerId: "reviewer-1" }),
    ).rejects.toBeInstanceOf(EntitlementFeatureNotAvailableError);
  });

  it("rejects a reviewer who is a participant but whose client role lacks ValidateWorkspace (e.g. CONTRIBUTOR)", async () => {
    const { ClientPermissionMissingError } = await import("../../../client-portfolio");
    assertClientAccessUseCase.execute = vi.fn(async (query: { actorId: string; permission: string }) => {
      if (query.actorId === "reviewer-1" && query.permission === "CLIENT_VALIDATE_WORKSPACE") {
        throw new ClientPermissionMissingError({ permission: query.permission });
      }
    });

    await expect(
      useCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        actorId: "user-1",
        actorRole: "BID_MANAGER",
        entityType: ApprovalEntityType.Task,
        entityId: "task-1",
        reviewerId: "reviewer-1",
      }),
    ).rejects.toBeInstanceOf(ApprovalReviewerNotAuthorizedError);
  });
});
