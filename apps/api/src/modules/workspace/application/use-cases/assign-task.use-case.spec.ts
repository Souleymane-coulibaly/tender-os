import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GetTenderUseCase } from "../../../tenders";
import { InvalidTaskAssigneeError } from "../../domain/errors";
import { Task } from "../../domain/task.entity";
import { TenderCollaborativeRole, TenderParticipant } from "../../domain/tender-participant.entity";
import {
  FakeAtomicTransactionRunner,
  FixedClock,
  InMemoryAuditLogWriter,
  InMemoryTaskRepository,
  InMemoryTenderActivityRepository,
  InMemoryTenderParticipantRepository,
  SequentialIdGenerator,
  FakeOutboxWriter,
} from "../../test-support/fakes";
import { TenderActivityRecorderService } from "../services/tender-activity-recorder.service";
import { AssignTaskUseCase } from "./assign-task.use-case";

describe("AssignTaskUseCase", () => {
  let taskRepository: InMemoryTaskRepository;
  let participantRepository: InMemoryTenderParticipantRepository;
  let getTenderUseCase: { execute: ReturnType<typeof vi.fn> };
  let assertClientAccessUseCase: { execute: ReturnType<typeof vi.fn> };
  let useCase: AssignTaskUseCase;

  beforeEach(async () => {
    taskRepository = new InMemoryTaskRepository();
    participantRepository = new InMemoryTenderParticipantRepository();
    getTenderUseCase = { execute: vi.fn(async () => ({ id: "tender-1", clientAccountId: "client-1" })) };
    assertClientAccessUseCase = { execute: vi.fn(async () => {}) };

    await taskRepository.save(Task.create({ id: "task-1", organizationId: "org-1", tenderId: "tender-1", title: "x", createdBy: "user-1", occurredAt: new Date() }));
    await participantRepository.save(
      TenderParticipant.create({ id: "p-1", organizationId: "org-1", tenderId: "tender-1", userId: "karim", role: TenderCollaborativeRole.TechnicalWriter, addedBy: "user-1", occurredAt: new Date() }),
    );

    const activityRecorder = new TenderActivityRecorderService(new InMemoryTenderActivityRepository(), new FixedClock(), new SequentialIdGenerator());
    useCase = new AssignTaskUseCase(
      taskRepository,
      participantRepository,
      new InMemoryAuditLogWriter(),
      new FakeOutboxWriter() as never,
      new FixedClock(),
      new FakeAtomicTransactionRunner(),
      getTenderUseCase as unknown as GetTenderUseCase,
      assertClientAccessUseCase as never,
      activityRecorder,
    );
  });

  it("assigns a real active participant of this Tender", async () => {
    const result = await useCase.execute({ organizationId: "org-1", tenderId: "tender-1", taskId: "task-1", actorId: "user-1", actorRole: "BID_MANAGER", assigneeId: "karim" });
    expect(result.assigneeId).toBe("karim");
  });

  it("rejects a valid-looking UUID that is not an active participant of this Tender (mission §17: a UUID alone is not enough)", async () => {
    await expect(
      useCase.execute({ organizationId: "org-1", tenderId: "tender-1", taskId: "task-1", actorId: "user-1", actorRole: "BID_MANAGER", assigneeId: "00000000-0000-0000-0000-000000000000" }),
    ).rejects.toBeInstanceOf(InvalidTaskAssigneeError);
  });

  it("rejects a participant of ANOTHER Tender (cross-tender assignment)", async () => {
    await participantRepository.save(
      TenderParticipant.create({ id: "p-2", organizationId: "org-1", tenderId: "tender-OTHER", userId: "outsider", role: TenderCollaborativeRole.Viewer, addedBy: "user-1", occurredAt: new Date() }),
    );

    await expect(
      useCase.execute({ organizationId: "org-1", tenderId: "tender-1", taskId: "task-1", actorId: "user-1", actorRole: "BID_MANAGER", assigneeId: "outsider" }),
    ).rejects.toBeInstanceOf(InvalidTaskAssigneeError);
  });

  it("allows explicit unassignment (assigneeId undefined) — zero responsible is valid, mission §17", async () => {
    await taskRepository.save(Task.create({ id: "task-2", organizationId: "org-1", tenderId: "tender-1", title: "y", createdBy: "user-1", assigneeId: "karim", occurredAt: new Date() }));

    const result = await useCase.execute({ organizationId: "org-1", tenderId: "tender-1", taskId: "task-2", actorId: "user-1", actorRole: "BID_MANAGER", assigneeId: undefined });

    expect(result.assigneeId).toBeUndefined();
  });

  it("rejects a participant removed from this Tender (mission §50: removal forbids new assignments)", async () => {
    const participant = await participantRepository.findActiveByUser({ organizationId: "org-1", tenderId: "tender-1", userId: "karim" });
    participant!.remove("admin-1", new Date());
    await participantRepository.save(participant!);

    await expect(
      useCase.execute({ organizationId: "org-1", tenderId: "tender-1", taskId: "task-1", actorId: "user-1", actorRole: "BID_MANAGER", assigneeId: "karim" }),
    ).rejects.toBeInstanceOf(InvalidTaskAssigneeError);
  });
});
