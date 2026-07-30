import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { ClientAssignment } from "../../domain/client-assignment.entity";
import { ClientPermission } from "../../domain/client-permission";
import { ClientRole } from "../../domain/client-role";
import { ClientAccountNotFoundError, ClientPermissionMissingError } from "../../domain/errors";
import { InMemoryClientAssignmentRepository } from "../../test-support/fakes";
import { AssertClientAccessUseCase } from "./assert-client-access.use-case";

const ORG = randomUUID();
const CLIENT = randomUUID();
const OTHER_CLIENT = randomUUID();

describe("AssertClientAccessUseCase — policy d'accès client centralisée (mission Sprint 5.1)", () => {
  let assignmentRepository: InMemoryClientAssignmentRepository;
  let useCase: AssertClientAccessUseCase;

  beforeEach(() => {
    assignmentRepository = new InMemoryClientAssignmentRepository();
    useCase = new AssertClientAccessUseCase(assignmentRepository);
  });

  it("OWNER bypasses everything, even with zero assignment on the client", async () => {
    await expect(
      useCase.execute({ organizationId: ORG, clientAccountId: CLIENT, actorId: randomUUID(), actorRole: "OWNER", permission: ClientPermission.Archive }),
    ).resolves.toBeUndefined();
  });

  it("ORGANIZATION_ADMIN bypasses everything, even with zero assignment on the client", async () => {
    await expect(
      useCase.execute({ organizationId: ORG, clientAccountId: CLIENT, actorId: randomUUID(), actorRole: "ORGANIZATION_ADMIN", permission: ClientPermission.Delete }),
    ).resolves.toBeUndefined();
  });

  it("a MEMBER-tier actor (e.g. BID_MANAGER) with NO assignment at all gets a 404-shaped not-found — never a 403", async () => {
    await expect(
      useCase.execute({ organizationId: ORG, clientAccountId: CLIENT, actorId: randomUUID(), actorRole: "BID_MANAGER", permission: ClientPermission.Read }),
    ).rejects.toBeInstanceOf(ClientAccountNotFoundError);
  });

  it("a CLIENT_MANAGER assignment grants read/update/assign but not archive/restore/delete", async () => {
    const userId = randomUUID();
    await assignmentRepository.create(
      ClientAssignment.create({ id: randomUUID(), organizationId: ORG, clientAccountId: CLIENT, userId, role: ClientRole.ClientManager, createdBy: randomUUID(), occurredAt: new Date() }),
    );

    await expect(useCase.execute({ organizationId: ORG, clientAccountId: CLIENT, actorId: userId, actorRole: "BID_MANAGER", permission: ClientPermission.Read })).resolves.toBeUndefined();
    await expect(useCase.execute({ organizationId: ORG, clientAccountId: CLIENT, actorId: userId, actorRole: "BID_MANAGER", permission: ClientPermission.Update })).resolves.toBeUndefined();
    await expect(useCase.execute({ organizationId: ORG, clientAccountId: CLIENT, actorId: userId, actorRole: "BID_MANAGER", permission: ClientPermission.AssignUser })).resolves.toBeUndefined();

    await expect(
      useCase.execute({ organizationId: ORG, clientAccountId: CLIENT, actorId: userId, actorRole: "BID_MANAGER", permission: ClientPermission.Archive }),
    ).rejects.toBeInstanceOf(ClientPermissionMissingError);
  });

  it("a CONTRIBUTOR assignment can create/read tenders but never assign users or update the client", async () => {
    const userId = randomUUID();
    await assignmentRepository.create(
      ClientAssignment.create({ id: randomUUID(), organizationId: ORG, clientAccountId: CLIENT, userId, role: ClientRole.Contributor, createdBy: randomUUID(), occurredAt: new Date() }),
    );

    await expect(useCase.execute({ organizationId: ORG, clientAccountId: CLIENT, actorId: userId, actorRole: "CONTRIBUTOR", permission: ClientPermission.CreateTender })).resolves.toBeUndefined();
    await expect(
      useCase.execute({ organizationId: ORG, clientAccountId: CLIENT, actorId: userId, actorRole: "CONTRIBUTOR", permission: ClientPermission.AssignUser }),
    ).rejects.toBeInstanceOf(ClientPermissionMissingError);
    await expect(
      useCase.execute({ organizationId: ORG, clientAccountId: CLIENT, actorId: userId, actorRole: "CONTRIBUTOR", permission: ClientPermission.Update }),
    ).rejects.toBeInstanceOf(ClientPermissionMissingError);
  });

  it("a VIEWER assignment can only read — any mutation permission is refused", async () => {
    const userId = randomUUID();
    await assignmentRepository.create(
      ClientAssignment.create({ id: randomUUID(), organizationId: ORG, clientAccountId: CLIENT, userId, role: ClientRole.Viewer, createdBy: randomUUID(), occurredAt: new Date() }),
    );

    await expect(useCase.execute({ organizationId: ORG, clientAccountId: CLIENT, actorId: userId, actorRole: "READ_ONLY", permission: ClientPermission.ReadTender })).resolves.toBeUndefined();
    await expect(
      useCase.execute({ organizationId: ORG, clientAccountId: CLIENT, actorId: userId, actorRole: "READ_ONLY", permission: ClientPermission.CreateTender }),
    ).rejects.toBeInstanceOf(ClientPermissionMissingError);
  });

  it("an assignment on a DIFFERENT client never grants access to this one (inter-client isolation)", async () => {
    const userId = randomUUID();
    await assignmentRepository.create(
      ClientAssignment.create({ id: randomUUID(), organizationId: ORG, clientAccountId: OTHER_CLIENT, userId, role: ClientRole.ClientManager, createdBy: randomUUID(), occurredAt: new Date() }),
    );

    await expect(
      useCase.execute({ organizationId: ORG, clientAccountId: CLIENT, actorId: userId, actorRole: "BID_MANAGER", permission: ClientPermission.Read }),
    ).rejects.toBeInstanceOf(ClientAccountNotFoundError);
  });

  it("an assignment scoped to a DIFFERENT organization never grants access (inter-organization isolation)", async () => {
    const userId = randomUUID();
    const otherOrg = randomUUID();
    await assignmentRepository.create(
      ClientAssignment.create({ id: randomUUID(), organizationId: otherOrg, clientAccountId: CLIENT, userId, role: ClientRole.ClientManager, createdBy: randomUUID(), occurredAt: new Date() }),
    );

    await expect(
      useCase.execute({ organizationId: ORG, clientAccountId: CLIENT, actorId: userId, actorRole: "BID_MANAGER", permission: ClientPermission.Read }),
    ).rejects.toBeInstanceOf(ClientAccountNotFoundError);
  });

  it("an unknown organization role with an assignment still falls through to the client-role check (no implicit portfolio bypass)", async () => {
    const userId = randomUUID();
    await assignmentRepository.create(
      ClientAssignment.create({ id: randomUUID(), organizationId: ORG, clientAccountId: CLIENT, userId, role: ClientRole.ClientManager, createdBy: randomUUID(), occurredAt: new Date() }),
    );

    await expect(
      useCase.execute({ organizationId: ORG, clientAccountId: CLIENT, actorId: userId, actorRole: "SOME_UNKNOWN_ROLE", permission: ClientPermission.Read }),
    ).resolves.toBeUndefined();
  });
});
