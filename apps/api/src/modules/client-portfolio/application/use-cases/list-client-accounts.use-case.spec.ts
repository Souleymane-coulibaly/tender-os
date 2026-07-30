import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { ClientAccount } from "../../domain/client-account.aggregate";
import { ClientAssignment } from "../../domain/client-assignment.entity";
import { ClientRole } from "../../domain/client-role";
import { InMemoryClientAccountRepository, InMemoryClientAssignmentRepository } from "../../test-support/fakes";
import { ListAccessibleClientsUseCase } from "./list-accessible-clients.use-case";
import { ListClientAccountsUseCase } from "./list-client-accounts.use-case";

const ORG = randomUUID();
const ACTOR = randomUUID();

describe("ListClientAccountsUseCase — visibility by role (mission Sprint 5.1 §portefeuille)", () => {
  let clientRepository: InMemoryClientAccountRepository;
  let assignmentRepository: InMemoryClientAssignmentRepository;
  let useCase: ListClientAccountsUseCase;
  let clientA: string;
  let clientB: string;

  beforeEach(async () => {
    clientRepository = new InMemoryClientAccountRepository();
    assignmentRepository = new InMemoryClientAssignmentRepository();
    useCase = new ListClientAccountsUseCase(clientRepository, new ListAccessibleClientsUseCase(assignmentRepository));

    const a = ClientAccount.create({ id: randomUUID(), organizationId: ORG, name: "Client A", createdBy: ACTOR, occurredAt: new Date() });
    const b = ClientAccount.create({ id: randomUUID(), organizationId: ORG, name: "Client B", createdBy: ACTOR, occurredAt: new Date() });
    await clientRepository.create(a);
    await clientRepository.create(b);
    clientA = a.id;
    clientB = b.id;
  });

  it("OWNER sees every client in the organization, with zero assignments", async () => {
    const result = await useCase.execute({ organizationId: ORG, actorId: randomUUID(), actorRole: "OWNER", includeArchived: false, limit: 25 });
    expect(result.items.map((c) => c.id).sort()).toEqual([clientA, clientB].sort());
  });

  it("ORGANIZATION_ADMIN sees every client", async () => {
    const result = await useCase.execute({ organizationId: ORG, actorId: randomUUID(), actorRole: "ORGANIZATION_ADMIN", includeArchived: false, limit: 25 });
    expect(result.items).toHaveLength(2);
  });

  it("a MEMBER-tier actor with an assignment on only Client A never sees Client B", async () => {
    const memberId = randomUUID();
    await assignmentRepository.create(
      ClientAssignment.create({ id: randomUUID(), organizationId: ORG, clientAccountId: clientA, userId: memberId, role: ClientRole.Contributor, createdBy: ACTOR, occurredAt: new Date() }),
    );

    const result = await useCase.execute({ organizationId: ORG, actorId: memberId, actorRole: "BID_MANAGER", includeArchived: false, limit: 25 });
    expect(result.items.map((c) => c.id)).toEqual([clientA]);
  });

  it("a MEMBER-tier actor with NO assignment at all sees an empty portfolio, never every client", async () => {
    const result = await useCase.execute({ organizationId: ORG, actorId: randomUUID(), actorRole: "BID_MANAGER", includeArchived: false, limit: 25 });
    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("never leaks a client from a DIFFERENT organization even to OWNER", async () => {
    const otherOrgClient = ClientAccount.create({ id: randomUUID(), organizationId: randomUUID(), name: "Other org client", createdBy: ACTOR, occurredAt: new Date() });
    await clientRepository.create(otherOrgClient);

    const result = await useCase.execute({ organizationId: ORG, actorId: randomUUID(), actorRole: "OWNER", includeArchived: false, limit: 25 });
    expect(result.items.map((c) => c.id)).not.toContain(otherOrgClient.id);
  });
});
