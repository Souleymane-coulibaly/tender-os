import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { UuidGenerator } from "../../../../shared-kernel/id-generator";
import { ClientPermissionMissingError, DuplicateClientAccountNameError } from "../../domain/errors";
import { FixedClock, InMemoryAuditLogWriter, InMemoryClientAccountRepository } from "../../test-support/fakes";
import { CreateClientAccountUseCase } from "./create-client-account.use-case";

const ORG = randomUUID();
const ACTOR = randomUUID();

describe("CreateClientAccountUseCase", () => {
  let repository: InMemoryClientAccountRepository;
  let auditLogWriter: InMemoryAuditLogWriter;
  let useCase: CreateClientAccountUseCase;

  beforeEach(() => {
    repository = new InMemoryClientAccountRepository();
    auditLogWriter = new InMemoryAuditLogWriter();
    useCase = new CreateClientAccountUseCase(repository, auditLogWriter, new FixedClock(), new UuidGenerator());
  });

  it("creates an ACTIVE client for OWNER", async () => {
    const result = await useCase.execute({ organizationId: ORG, actorId: ACTOR, actorRole: "OWNER", name: "Acme Corp" });
    expect(result.status).toBe("ACTIVE");
    expect(result.name).toBe("Acme Corp");
  });

  it("creates for ORGANIZATION_ADMIN", async () => {
    await expect(useCase.execute({ organizationId: ORG, actorId: ACTOR, actorRole: "ORGANIZATION_ADMIN", name: "Acme" })).resolves.toBeDefined();
  });

  it("rejects any non-portfolio role (e.g. BID_MANAGER, CONTRIBUTOR, READ_ONLY)", async () => {
    for (const role of ["BID_MANAGER", "CONTRIBUTOR", "READ_ONLY"]) {
      await expect(useCase.execute({ organizationId: ORG, actorId: ACTOR, actorRole: role, name: "x" })).rejects.toBeInstanceOf(ClientPermissionMissingError);
    }
  });

  it("rejects a duplicate name within the same organization, case/space-insensitive", async () => {
    await useCase.execute({ organizationId: ORG, actorId: ACTOR, actorRole: "OWNER", name: "Acme Corp" });
    await expect(useCase.execute({ organizationId: ORG, actorId: ACTOR, actorRole: "OWNER", name: "  ACME   corp " })).rejects.toBeInstanceOf(DuplicateClientAccountNameError);
  });

  it("allows the same name in a DIFFERENT organization", async () => {
    await useCase.execute({ organizationId: ORG, actorId: ACTOR, actorRole: "OWNER", name: "Acme Corp" });
    await expect(useCase.execute({ organizationId: randomUUID(), actorId: ACTOR, actorRole: "OWNER", name: "Acme Corp" })).resolves.toBeDefined();
  });

  it("records an audit log entry", async () => {
    await useCase.execute({ organizationId: ORG, actorId: ACTOR, actorRole: "OWNER", name: "Acme" });
    expect(auditLogWriter.entries.map((e) => e.action)).toContain("client_account.created");
  });
});
