import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GetTenderUseCase } from "../../../tenders";
import { OrganizationMembership } from "../../../memberships";
import { MembershipId } from "../../../memberships/domain/membership-id.value-object";
import { OrganizationRole } from "../../../memberships/domain/organization-role";
import { InvalidTenderParticipantCandidateError, TenderParticipantAlreadyActiveError, TenderParticipantBypassJustificationRequiredError } from "../../domain/errors";
import { TenderCollaborativeRole, TenderParticipant } from "../../domain/tender-participant.entity";
import { FakeAtomicTransactionRunner, FixedClock, InMemoryAuditLogWriter, InMemoryTenderParticipantRepository, SequentialIdGenerator, FakeOutboxWriter } from "../../test-support/fakes";
import { TenderActivityRecorderService } from "../services/tender-activity-recorder.service";
import { InMemoryTenderActivityRepository } from "../../test-support/fakes";
import { AddTenderParticipantUseCase } from "./add-tender-participant.use-case";

function membership(input: { userId: string; role: string }): OrganizationMembership {
  return OrganizationMembership.create({
    id: MembershipId.from("membership-1"),
    organizationId: "org-1",
    userId: input.userId,
    role: input.role as OrganizationRole,
    occurredAt: new Date("2025-01-01T00:00:00.000Z"),
  });
}

describe("AddTenderParticipantUseCase", () => {
  let participantRepository: InMemoryTenderParticipantRepository;
  let membershipRepository: { findByOrganizationAndUser: ReturnType<typeof vi.fn> };
  let getTenderUseCase: { execute: ReturnType<typeof vi.fn> };
  let assertClientAccessUseCase: { execute: ReturnType<typeof vi.fn> };
  let useCase: AddTenderParticipantUseCase;

  beforeEach(() => {
    participantRepository = new InMemoryTenderParticipantRepository();
    membershipRepository = { findByOrganizationAndUser: vi.fn(async () => membership({ userId: "target-1", role: "CONTRIBUTOR" })) };
    getTenderUseCase = { execute: vi.fn(async () => ({ id: "tender-1", clientAccountId: "client-1" })) };
    assertClientAccessUseCase = { execute: vi.fn(async () => {}) };

    const activityRecorder = new TenderActivityRecorderService(new InMemoryTenderActivityRepository(), new FixedClock(), new SequentialIdGenerator());

    useCase = new AddTenderParticipantUseCase(
      participantRepository,
      membershipRepository as never,
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

  it("adds a participant when the target user has a real client assignment", async () => {
    const result = await useCase.execute({
      organizationId: "org-1",
      tenderId: "tender-1",
      actorId: "actor-1",
      actorRole: "BID_MANAGER",
      userId: "target-1",
      role: TenderCollaborativeRole.TechnicalWriter,
    });

    expect(result.userId).toBe("target-1");
    expect(result.role).toBe(TenderCollaborativeRole.TechnicalWriter);
    expect(participantRepository.participants).toHaveLength(1);
  });

  it("rejects adding a user who is already an active participant", async () => {
    await participantRepository.save(
      TenderParticipant.create({ id: "p-1", organizationId: "org-1", tenderId: "tender-1", userId: "target-1", role: TenderCollaborativeRole.Viewer, addedBy: "actor-1", occurredAt: new Date() }),
    );

    await expect(
      useCase.execute({ organizationId: "org-1", tenderId: "tender-1", actorId: "actor-1", actorRole: "BID_MANAGER", userId: "target-1", role: TenderCollaborativeRole.TechnicalWriter }),
    ).rejects.toBeInstanceOf(TenderParticipantAlreadyActiveError);
  });

  it("rejects a target user with no active organization membership", async () => {
    membershipRepository.findByOrganizationAndUser = vi.fn(async () => null);

    await expect(
      useCase.execute({ organizationId: "org-1", tenderId: "tender-1", actorId: "actor-1", actorRole: "BID_MANAGER", userId: "target-1", role: TenderCollaborativeRole.Viewer }),
    ).rejects.toBeInstanceOf(InvalidTenderParticipantCandidateError);
  });

  it("propagates the client access error for a non-admin actor when the target has no real client assignment (no silent bypass)", async () => {
    const error = new (class ClientAccountNotFoundErrorLike extends Error {})();
    assertClientAccessUseCase.execute = vi.fn(async () => {
      throw error;
    });

    await expect(
      useCase.execute({ organizationId: "org-1", tenderId: "tender-1", actorId: "actor-1", actorRole: "BID_MANAGER", userId: "target-1", role: TenderCollaborativeRole.Viewer }),
    ).rejects.toBe(error);
  });

  it("requires an explicit justification when OWNER/ORGANIZATION_ADMIN uses the tracked bypass", async () => {
    const { ClientAccountNotFoundError } = await import("../../../client-portfolio");
    // Seule la vérification portant sur la CIBLE (actorId: target-1) échoue — l'accès de l'ACTEUR
    // lui-même (ManageWorkspace) reste valide, sinon on ne testerait jamais le bypass ciblé.
    assertClientAccessUseCase.execute = vi.fn(async (query: { actorId: string }) => {
      if (query.actorId === "target-1") {
        throw new ClientAccountNotFoundError();
      }
    });

    await expect(
      useCase.execute({ organizationId: "org-1", tenderId: "tender-1", actorId: "owner-1", actorRole: "OWNER", userId: "target-1", role: TenderCollaborativeRole.Viewer }),
    ).rejects.toBeInstanceOf(TenderParticipantBypassJustificationRequiredError);
  });

  it("accepts the tracked bypass with a justification, and audits it explicitly", async () => {
    const { ClientAccountNotFoundError } = await import("../../../client-portfolio");
    assertClientAccessUseCase.execute = vi.fn(async (query: { actorId: string }) => {
      if (query.actorId === "target-1") {
        throw new ClientAccountNotFoundError();
      }
    });
    const auditLogWriter = new InMemoryAuditLogWriter();
    const activityRecorder = new TenderActivityRecorderService(new InMemoryTenderActivityRepository(), new FixedClock(), new SequentialIdGenerator());
    const useCaseWithAudit = new AddTenderParticipantUseCase(
      participantRepository,
      membershipRepository as never,
      auditLogWriter,
      new FakeOutboxWriter() as never,
      new FixedClock(),
      new SequentialIdGenerator(),
      new FakeAtomicTransactionRunner(),
      getTenderUseCase as unknown as GetTenderUseCase,
      assertClientAccessUseCase as never,
      activityRecorder,
    );

    const result = await useCaseWithAudit.execute({
      organizationId: "org-1",
      tenderId: "tender-1",
      actorId: "owner-1",
      actorRole: "OWNER",
      userId: "target-1",
      role: TenderCollaborativeRole.Viewer,
      justification: "Remplacement urgent d'un membre absent.",
    });

    expect(result.userId).toBe("target-1");
    const entry = auditLogWriter.entries.find((e) => e.action === "workspace.participant_added");
    expect(entry?.metadata?.clientAssignmentBypass).toBe(true);
    expect(entry?.metadata?.justification).toBe("Remplacement urgent d'un membre absent.");
  });
});
