import { beforeEach, describe, expect, it } from "vitest";
import { TenderPermissionMissingError } from "../../domain/errors";
import { FixedClock, InMemoryAuditLogWriter, InMemoryRiskRepository, SequentialIdGenerator } from "../../test-support/fakes";
import { CreateRiskUseCase } from "./create-risk.use-case";

describe("CreateRiskUseCase", () => {
  let riskRepository: InMemoryRiskRepository;
  let auditLogWriter: InMemoryAuditLogWriter;
  let useCase: CreateRiskUseCase;

  beforeEach(() => {
    riskRepository = new InMemoryRiskRepository();
    auditLogWriter = new InMemoryAuditLogWriter();
    useCase = new CreateRiskUseCase(riskRepository, auditLogWriter, new FixedClock(), new SequentialIdGenerator());
  });

  it("creates an OPEN risk and records an audit entry when the actor can manage risks", async () => {
    const result = await useCase.execute({
      organizationId: "org-1",
      tenderId: "tender-1",
      actorId: "user-1",
      actorRole: "BID_MANAGER",
      title: "Delai tres court",
      severity: "CRITICAL",
    });

    expect(result.status).toBe("OPEN");
    expect(auditLogWriter.entries[0]?.action).toBe("tender.risk_created");
  });

  it("refuses when the actor lacks tender:manage_risks (e.g. READ_ONLY)", async () => {
    await expect(
      useCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        actorId: "user-1",
        actorRole: "READ_ONLY",
        title: "Delai tres court",
        severity: "CRITICAL",
      }),
    ).rejects.toThrow(TenderPermissionMissingError);

    expect(auditLogWriter.entries).toHaveLength(0);
  });
});
