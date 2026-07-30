import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { UuidGenerator } from "../../../../shared-kernel/id-generator";
import { ClientAccount } from "../../domain/client-account.aggregate";
import { ClientAssignment } from "../../domain/client-assignment.entity";
import { ClientRole } from "../../domain/client-role";
import { ClientPermissionMissingError } from "../../domain/errors";
import {
  FixedClock,
  InMemoryAuditLogWriter,
  InMemoryClientAccountRepository,
  InMemoryClientAssignmentRepository,
} from "../../test-support/fakes";
import { AssertClientAccessUseCase } from "./assert-client-access.use-case";
import { AssignUserToClientUseCase } from "./assign-user-to-client.use-case";
import { GetClientAccountUseCase } from "./get-client-account.use-case";
import { RemoveClientAssignmentUseCase } from "./remove-client-assignment.use-case";
import { UpdateClientAccountUseCase } from "./update-client-account.use-case";
import { UpdateClientAssignmentUseCase } from "./update-client-assignment.use-case";

const ORG = randomUUID();

/**
 * Correction P1 — reproduit un utilisateur VIEWER/READ_ONLY migré par le backfill
 * (20260730194351_add_client_portfolio) : rôle client VIEWER, rôle organisation non-bypass
 * (CONTRIBUTOR, jamais OWNER/ORGANIZATION_ADMIN). Vérifie que la migration ne lui accorde
 * aucun droit d'écriture (ni sur le client, ni sur ses affectations) tout en préservant
 * son accès en lecture.
 */
describe("VIEWER-tier migrated assignment — read preserved, no write escalation", () => {
  let clientAccountRepository: InMemoryClientAccountRepository;
  let clientAssignmentRepository: InMemoryClientAssignmentRepository;
  let assertClientAccessUseCase: AssertClientAccessUseCase;
  let clientId: string;
  let migratedUserId: string;

  beforeEach(async () => {
    clientAccountRepository = new InMemoryClientAccountRepository();
    clientAssignmentRepository = new InMemoryClientAssignmentRepository();
    assertClientAccessUseCase = new AssertClientAccessUseCase(clientAssignmentRepository);

    const client = ClientAccount.create({
      id: randomUUID(),
      organizationId: ORG,
      name: "Compte principal",
      createdBy: randomUUID(),
      occurredAt: new Date(),
    });
    await clientAccountRepository.create(client);
    clientId = client.id;

    migratedUserId = randomUUID();
    await clientAssignmentRepository.create(
      ClientAssignment.create({
        id: randomUUID(),
        organizationId: ORG,
        clientAccountId: clientId,
        userId: migratedUserId,
        role: ClientRole.Viewer,
        createdBy: "migration",
        occurredAt: new Date(),
      }),
    );
  });

  it("preserves read access on the client account", async () => {
    const useCase = new GetClientAccountUseCase(clientAccountRepository, assertClientAccessUseCase);

    const result = await useCase.execute({
      organizationId: ORG,
      clientAccountId: clientId,
      actorId: migratedUserId,
      actorRole: "CONTRIBUTOR",
    });

    expect(result.id).toBe(clientId);
  });

  it("refuses to update the client account (no write escalation from the migration)", async () => {
    const useCase = new UpdateClientAccountUseCase(
      clientAccountRepository,
      new InMemoryAuditLogWriter(),
      new FixedClock(),
      assertClientAccessUseCase,
    );

    await expect(
      useCase.execute({
        organizationId: ORG,
        clientAccountId: clientId,
        actorId: migratedUserId,
        actorRole: "CONTRIBUTOR",
        name: "Nouveau nom",
      }),
    ).rejects.toBeInstanceOf(ClientPermissionMissingError);
  });

  it("refuses to assign another user to the client", async () => {
    const useCase = new AssignUserToClientUseCase(
      clientAccountRepository,
      clientAssignmentRepository,
      { findByOrganizationAndUser: async () => null } as never,
      new InMemoryAuditLogWriter(),
      new FixedClock(),
      new UuidGenerator(),
      assertClientAccessUseCase,
    );

    await expect(
      useCase.execute({
        organizationId: ORG,
        clientAccountId: clientId,
        actorId: migratedUserId,
        actorRole: "CONTRIBUTOR",
        targetUserId: randomUUID(),
        role: "VIEWER",
      }),
    ).rejects.toBeInstanceOf(ClientPermissionMissingError);
  });

  it("refuses to change another assignment's client role", async () => {
    const otherAssignment = ClientAssignment.create({
      id: randomUUID(),
      organizationId: ORG,
      clientAccountId: clientId,
      userId: randomUUID(),
      role: ClientRole.Contributor,
      createdBy: "seed",
      occurredAt: new Date(),
    });
    await clientAssignmentRepository.create(otherAssignment);

    const useCase = new UpdateClientAssignmentUseCase(
      clientAccountRepository,
      clientAssignmentRepository,
      new InMemoryAuditLogWriter(),
      new FixedClock(),
      assertClientAccessUseCase,
    );

    await expect(
      useCase.execute({
        organizationId: ORG,
        clientAccountId: clientId,
        assignmentId: otherAssignment.id,
        actorId: migratedUserId,
        actorRole: "CONTRIBUTOR",
        role: "CLIENT_MANAGER",
      }),
    ).rejects.toBeInstanceOf(ClientPermissionMissingError);
  });

  it("refuses to remove another user's assignment", async () => {
    const otherAssignment = ClientAssignment.create({
      id: randomUUID(),
      organizationId: ORG,
      clientAccountId: clientId,
      userId: randomUUID(),
      role: ClientRole.Contributor,
      createdBy: "seed",
      occurredAt: new Date(),
    });
    await clientAssignmentRepository.create(otherAssignment);

    const useCase = new RemoveClientAssignmentUseCase(
      clientAccountRepository,
      clientAssignmentRepository,
      new InMemoryAuditLogWriter(),
      assertClientAccessUseCase,
    );

    await expect(
      useCase.execute({
        organizationId: ORG,
        clientAccountId: clientId,
        assignmentId: otherAssignment.id,
        actorId: migratedUserId,
        actorRole: "CONTRIBUTOR",
      }),
    ).rejects.toBeInstanceOf(ClientPermissionMissingError);
  });
});
