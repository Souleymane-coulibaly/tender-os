import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GetTenderUseCase } from "../../../tenders";
import type { ChecklistItemRepository } from "../../../tenders";
import { CommentEntityType } from "../../domain/comment.entity";
import { InvalidMentionTargetError } from "../../domain/errors";
import { TenderCollaborativeRole, TenderParticipant } from "../../domain/tender-participant.entity";
import { Task } from "../../domain/task.entity";
import {
  FakeAtomicTransactionRunner,
  FixedClock,
  InMemoryAuditLogWriter,
  InMemoryCommentRepository,
  InMemoryMentionRepository,
  InMemoryTaskRepository,
  InMemoryTenderActivityRepository,
  InMemoryTenderParticipantRepository,
  SequentialIdGenerator,
  FakeOutboxWriter,
} from "../../test-support/fakes";
import { TenderActivityRecorderService } from "../services/tender-activity-recorder.service";
import { CreateCommentUseCase } from "./create-comment.use-case";

describe("CreateCommentUseCase", () => {
  let commentRepository: InMemoryCommentRepository;
  let mentionRepository: InMemoryMentionRepository;
  let taskRepository: InMemoryTaskRepository;
  let participantRepository: InMemoryTenderParticipantRepository;
  let getTenderUseCase: { execute: ReturnType<typeof vi.fn> };
  let assertClientAccessUseCase: { execute: ReturnType<typeof vi.fn> };
  let useCase: CreateCommentUseCase;

  beforeEach(async () => {
    mentionRepository = new InMemoryMentionRepository();
    commentRepository = new InMemoryCommentRepository(mentionRepository);
    taskRepository = new InMemoryTaskRepository();
    participantRepository = new InMemoryTenderParticipantRepository();
    getTenderUseCase = { execute: vi.fn(async () => ({ id: "tender-1", clientAccountId: "client-1" })) };
    assertClientAccessUseCase = { execute: vi.fn(async () => {}) };

    await taskRepository.save(Task.create({ id: "task-1", organizationId: "org-1", tenderId: "tender-1", title: "Fournir attestation", createdBy: "user-1", occurredAt: new Date() }));
    await participantRepository.save(
      TenderParticipant.create({ id: "p-1", organizationId: "org-1", tenderId: "tender-1", userId: "karim", role: TenderCollaborativeRole.TechnicalWriter, addedBy: "user-1", occurredAt: new Date() }),
    );

    const activityRecorder = new TenderActivityRecorderService(new InMemoryTenderActivityRepository(), new FixedClock(), new SequentialIdGenerator());

    useCase = new CreateCommentUseCase(
      commentRepository,
      taskRepository,
      {} as unknown as ChecklistItemRepository,
      participantRepository,
      new InMemoryAuditLogWriter(),
      new FakeOutboxWriter() as never,
      new FixedClock(),
      new SequentialIdGenerator(),
      new FakeAtomicTransactionRunner(),
      getTenderUseCase as unknown as GetTenderUseCase,
      assertClientAccessUseCase as never,
      activityRecorder,
    );
  });

  it("creates a comment with a valid mention (real participant of this Tender)", async () => {
    const result = await useCase.execute({
      organizationId: "org-1",
      tenderId: "tender-1",
      actorId: "user-1",
      actorRole: "BID_MANAGER",
      entityType: CommentEntityType.Task,
      entityId: "task-1",
      body: "Karim, peux-tu vérifier ?",
      mentionedUserIds: ["karim"],
    });

    expect(result.mentionedUserIds).toEqual(["karim"]);
    expect(commentRepository.comments).toHaveLength(1);
    expect(mentionRepository.mentions).toHaveLength(1);
  });

  it("refuses the WHOLE comment (mission §47) when a mentioned user is not an active participant of this Tender — never a comment created with the mention silently dropped", async () => {
    await expect(
      useCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        actorId: "user-1",
        actorRole: "BID_MANAGER",
        entityType: CommentEntityType.Task,
        entityId: "task-1",
        body: "Jean, peux-tu vérifier ?",
        mentionedUserIds: ["jean-sans-acces"],
      }),
    ).rejects.toBeInstanceOf(InvalidMentionTargetError);

    // Rien n'a été créé — ni le commentaire, ni une mention orpheline.
    expect(commentRepository.comments).toHaveLength(0);
    expect(mentionRepository.mentions).toHaveLength(0);
  });

  it("rejects a comment on a Task belonging to a different Tender (anti-IDOR)", async () => {
    await taskRepository.save(Task.create({ id: "task-other", organizationId: "org-1", tenderId: "tender-OTHER", title: "x", createdBy: "user-1", occurredAt: new Date() }));

    await expect(
      useCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        actorId: "user-1",
        actorRole: "BID_MANAGER",
        entityType: CommentEntityType.Task,
        entityId: "task-other",
        body: "x",
      }),
    ).rejects.toThrow();
    expect(commentRepository.comments).toHaveLength(0);
  });

  it("creates a comment with no mentions when none are provided", async () => {
    const result = await useCase.execute({
      organizationId: "org-1",
      tenderId: "tender-1",
      actorId: "user-1",
      actorRole: "BID_MANAGER",
      entityType: CommentEntityType.Tender,
      entityId: "tender-1",
      body: "Point d'avancement général.",
    });

    expect(result.mentionedUserIds).toEqual([]);
  });
});
