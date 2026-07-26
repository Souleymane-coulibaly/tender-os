import { beforeEach, describe, expect, it } from "vitest";
import { TenderPermissionMissingError } from "../../domain/errors";
import { FixedClock, InMemoryAuditLogWriter, InMemoryTenderRepository, SequentialIdGenerator } from "../../test-support/fakes";
import { CreateTenderUseCase } from "./create-tender.use-case";

describe("CreateTenderUseCase", () => {
  let tenderRepository: InMemoryTenderRepository;
  let auditLogWriter: InMemoryAuditLogWriter;
  let useCase: CreateTenderUseCase;

  beforeEach(() => {
    tenderRepository = new InMemoryTenderRepository();
    auditLogWriter = new InMemoryAuditLogWriter();
    useCase = new CreateTenderUseCase(tenderRepository, auditLogWriter, new FixedClock(), new SequentialIdGenerator());
  });

  it("creates a DRAFT tender and records an audit entry when the actor is a Bid Manager", async () => {
    const result = await useCase.execute({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: "BID_MANAGER",
      title: "Marche de nettoyage",
    });

    expect(result.status).toBe("DRAFT");
    expect(result.version).toBe(1);
    expect(auditLogWriter.entries).toHaveLength(1);
    expect(auditLogWriter.entries[0]?.action).toBe("tender.created");
  });

  it("refuses when the actor lacks tender:create", async () => {
    await expect(
      useCase.execute({
        organizationId: "org-1",
        actorId: "user-1",
        actorRole: "READ_ONLY",
        title: "Marche de nettoyage",
      }),
    ).rejects.toThrow(TenderPermissionMissingError);

    expect(auditLogWriter.entries).toHaveLength(0);
  });
});
