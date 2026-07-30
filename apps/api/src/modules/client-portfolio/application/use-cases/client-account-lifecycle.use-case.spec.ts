import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { ClientAccount } from "../../domain/client-account.aggregate";
import { ClientAccountNotArchivedError, ClientAccountNotFoundError } from "../../domain/errors";
import { FixedClock, InMemoryAuditLogWriter, InMemoryClientAccountRepository, InMemoryClientAssignmentRepository } from "../../test-support/fakes";
import { ArchiveClientAccountUseCase } from "./archive-client-account.use-case";
import { AssertClientAccessUseCase } from "./assert-client-access.use-case";
import { DeleteClientAccountUseCase } from "./delete-client-account.use-case";
import { RestoreClientAccountUseCase } from "./restore-client-account.use-case";

const ORG = randomUUID();
const ACTOR = randomUUID();

describe("Client account lifecycle (archive/restore/delete)", () => {
  let clientRepository: InMemoryClientAccountRepository;
  let assignmentRepository: InMemoryClientAssignmentRepository;
  let auditLogWriter: InMemoryAuditLogWriter;
  let assertClientAccessUseCase: AssertClientAccessUseCase;
  let archiveUseCase: ArchiveClientAccountUseCase;
  let restoreUseCase: RestoreClientAccountUseCase;
  let deleteUseCase: DeleteClientAccountUseCase;
  let clientId: string;

  beforeEach(async () => {
    clientRepository = new InMemoryClientAccountRepository();
    assignmentRepository = new InMemoryClientAssignmentRepository();
    auditLogWriter = new InMemoryAuditLogWriter();
    assertClientAccessUseCase = new AssertClientAccessUseCase(assignmentRepository);
    archiveUseCase = new ArchiveClientAccountUseCase(clientRepository, auditLogWriter, new FixedClock(), assertClientAccessUseCase);
    restoreUseCase = new RestoreClientAccountUseCase(clientRepository, auditLogWriter, new FixedClock(), assertClientAccessUseCase);
    deleteUseCase = new DeleteClientAccountUseCase(clientRepository, auditLogWriter, assertClientAccessUseCase);

    const client = ClientAccount.create({ id: randomUUID(), organizationId: ORG, name: "Acme", createdBy: ACTOR, occurredAt: new Date() });
    await clientRepository.create(client);
    clientId = client.id;
  });

  it("OWNER archives then restores a client", async () => {
    await archiveUseCase.execute({ organizationId: ORG, clientAccountId: clientId, actorId: ACTOR, actorRole: "OWNER" });
    expect((await clientRepository.findById({ organizationId: ORG, clientAccountId: clientId }))!.status).toBe("ARCHIVED");

    await restoreUseCase.execute({ organizationId: ORG, clientAccountId: clientId, actorId: ACTOR, actorRole: "OWNER" });
    expect((await clientRepository.findById({ organizationId: ORG, clientAccountId: clientId }))!.status).toBe("ACTIVE");
  });

  it("a CLIENT_MANAGER-assigned actor cannot archive (portfolio-only capability)", async () => {
    await expect(archiveUseCase.execute({ organizationId: ORG, clientAccountId: clientId, actorId: randomUUID(), actorRole: "BID_MANAGER" })).rejects.toThrow();
  });

  it("deleting a non-archived client is refused", async () => {
    await expect(deleteUseCase.execute({ organizationId: ORG, clientAccountId: clientId, actorId: ACTOR, actorRole: "OWNER" })).rejects.toBeInstanceOf(ClientAccountNotArchivedError);
  });

  it("deletes an archived client", async () => {
    await archiveUseCase.execute({ organizationId: ORG, clientAccountId: clientId, actorId: ACTOR, actorRole: "OWNER" });
    await deleteUseCase.execute({ organizationId: ORG, clientAccountId: clientId, actorId: ACTOR, actorRole: "OWNER" });
    expect(await clientRepository.findById({ organizationId: ORG, clientAccountId: clientId })).toBeNull();
  });

  it("archiving is idempotent — a second archive call never throws", async () => {
    await archiveUseCase.execute({ organizationId: ORG, clientAccountId: clientId, actorId: ACTOR, actorRole: "OWNER" });
    await expect(archiveUseCase.execute({ organizationId: ORG, clientAccountId: clientId, actorId: ACTOR, actorRole: "OWNER" })).resolves.toBeDefined();
  });

  it("a non-OWNER/ADMIN actor with no assignment on an existing client cannot even discover it (not-found, not forbidden)", async () => {
    await expect(archiveUseCase.execute({ organizationId: ORG, clientAccountId: clientId, actorId: randomUUID(), actorRole: "BID_MANAGER" })).rejects.toBeInstanceOf(
      ClientAccountNotFoundError,
    );
  });
});
