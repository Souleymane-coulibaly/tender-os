import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { UuidGenerator } from "../../../../shared-kernel/id-generator";
import { InMemoryMembershipRepository } from "../../../memberships/test-support/in-memory-membership.repository";
import { OrganizationMembership } from "../../../memberships/domain/organization-membership.aggregate";
import { MembershipId } from "../../../memberships/domain/membership-id.value-object";
import { ClientAccount } from "../../domain/client-account.aggregate";
import { CrossOrganizationUserError, DuplicateClientAssignmentError, InvalidClientRoleError } from "../../domain/errors";
import { FixedClock, InMemoryAuditLogWriter, InMemoryClientAccountRepository, InMemoryClientAssignmentRepository } from "../../test-support/fakes";
import { AssertClientAccessUseCase } from "./assert-client-access.use-case";
import { AssignUserToClientUseCase } from "./assign-user-to-client.use-case";

const ORG = randomUUID();
const ACTOR = randomUUID();

describe("AssignUserToClientUseCase", () => {
  let clientRepository: InMemoryClientAccountRepository;
  let assignmentRepository: InMemoryClientAssignmentRepository;
  let membershipRepository: InMemoryMembershipRepository;
  let auditLogWriter: InMemoryAuditLogWriter;
  let useCase: AssignUserToClientUseCase;
  let clientId: string;

  beforeEach(async () => {
    clientRepository = new InMemoryClientAccountRepository();
    assignmentRepository = new InMemoryClientAssignmentRepository();
    membershipRepository = new InMemoryMembershipRepository();
    auditLogWriter = new InMemoryAuditLogWriter();
    useCase = new AssignUserToClientUseCase(
      clientRepository,
      assignmentRepository,
      membershipRepository,
      auditLogWriter,
      new FixedClock(),
      new UuidGenerator(),
      new AssertClientAccessUseCase(assignmentRepository),
    );

    const client = ClientAccount.create({ id: randomUUID(), organizationId: ORG, name: "Acme", createdBy: ACTOR, occurredAt: new Date() });
    await clientRepository.create(client);
    clientId = client.id;
  });

  it("assigns a user who belongs to the organization", async () => {
    const targetUserId = randomUUID();
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: ORG, userId: targetUserId, role: "CONTRIBUTOR", occurredAt: new Date() }),
    );

    const result = await useCase.execute({ organizationId: ORG, clientAccountId: clientId, actorId: ACTOR, actorRole: "OWNER", targetUserId, role: "CONTRIBUTOR" });
    expect(result.role).toBe("CONTRIBUTOR");
    expect(auditLogWriter.entries.map((e) => e.action)).toContain("client_assignment.created");
  });

  it("rejects a user from a DIFFERENT organization", async () => {
    const targetUserId = randomUUID();
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: randomUUID(), userId: targetUserId, role: "CONTRIBUTOR", occurredAt: new Date() }),
    );

    await expect(
      useCase.execute({ organizationId: ORG, clientAccountId: clientId, actorId: ACTOR, actorRole: "OWNER", targetUserId, role: "CONTRIBUTOR" }),
    ).rejects.toBeInstanceOf(CrossOrganizationUserError);
  });

  it("rejects a duplicate assignment for the same (client, user)", async () => {
    const targetUserId = randomUUID();
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: ORG, userId: targetUserId, role: "CONTRIBUTOR", occurredAt: new Date() }),
    );

    await useCase.execute({ organizationId: ORG, clientAccountId: clientId, actorId: ACTOR, actorRole: "OWNER", targetUserId, role: "VIEWER" });
    await expect(
      useCase.execute({ organizationId: ORG, clientAccountId: clientId, actorId: ACTOR, actorRole: "OWNER", targetUserId, role: "CONTRIBUTOR" }),
    ).rejects.toBeInstanceOf(DuplicateClientAssignmentError);
  });

  it("rejects an invalid client role", async () => {
    const targetUserId = randomUUID();
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: ORG, userId: targetUserId, role: "CONTRIBUTOR", occurredAt: new Date() }),
    );

    await expect(
      useCase.execute({ organizationId: ORG, clientAccountId: clientId, actorId: ACTOR, actorRole: "OWNER", targetUserId, role: "NOT_A_REAL_ROLE" }),
    ).rejects.toBeInstanceOf(InvalidClientRoleError);
  });
});
