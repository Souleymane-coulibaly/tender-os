import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { UuidGenerator } from "../../../../shared-kernel/id-generator";
import { DuplicateCandidateCompanyNameError, InvalidSirenError } from "../../domain/errors";
import { FixedClock, InMemoryAuditLogWriter, InMemoryCandidateCompanyRepository } from "../../test-support/fakes";
import { CreateCandidateCompanyUseCase } from "./create-candidate-company.use-case";

const ORG = randomUUID();
const ACTOR = randomUUID();

describe("CreateCandidateCompanyUseCase", () => {
  let repository: InMemoryCandidateCompanyRepository;
  let auditLogWriter: InMemoryAuditLogWriter;
  let useCase: CreateCandidateCompanyUseCase;

  beforeEach(() => {
    repository = new InMemoryCandidateCompanyRepository();
    auditLogWriter = new InMemoryAuditLogWriter();
    useCase = new CreateCandidateCompanyUseCase(repository, auditLogWriter, new FixedClock(), new UuidGenerator());
  });

  it("creates an ACTIVE candidate company", async () => {
    const result = await useCase.execute({ organizationId: ORG, actorId: ACTOR, actorRole: "OWNER", name: "Acme Travaux Publics" });
    expect(result.status).toBe("ACTIVE");
    expect(result.name).toBe("Acme Travaux Publics");
  });

  it("accepts a valid SIREN", async () => {
    const result = await useCase.execute({ organizationId: ORG, actorId: ACTOR, actorRole: "OWNER", name: "Acme", siren: "356000000" });
    expect(result.siren).toBe("356000000");
  });

  it("rejects an invalid SIREN (fails Luhn checksum)", async () => {
    await expect(useCase.execute({ organizationId: ORG, actorId: ACTOR, actorRole: "OWNER", name: "Acme", siren: "356000001" })).rejects.toBeInstanceOf(InvalidSirenError);
  });

  it("rejects a duplicate name within the same organization, case/space-insensitive", async () => {
    await useCase.execute({ organizationId: ORG, actorId: ACTOR, actorRole: "OWNER", name: "Acme Travaux Publics" });
    await expect(useCase.execute({ organizationId: ORG, actorId: ACTOR, actorRole: "OWNER", name: "  ACME   Travaux Publics " })).rejects.toBeInstanceOf(
      DuplicateCandidateCompanyNameError,
    );
  });

  it("allows the same name in a DIFFERENT organization", async () => {
    await useCase.execute({ organizationId: ORG, actorId: ACTOR, actorRole: "OWNER", name: "Acme Travaux Publics" });
    await expect(useCase.execute({ organizationId: randomUUID(), actorId: ACTOR, actorRole: "OWNER", name: "Acme Travaux Publics" })).resolves.toBeDefined();
  });

  it("records an audit log entry", async () => {
    await useCase.execute({ organizationId: ORG, actorId: ACTOR, actorRole: "OWNER", name: "Acme" });
    expect(auditLogWriter.entries.map((e) => e.action)).toContain("candidate_company.created");
  });

  it("never persists sourceClientAccountId unless explicitly provided (no implicit ClientAccount coupling)", async () => {
    const result = await useCase.execute({ organizationId: ORG, actorId: ACTOR, actorRole: "OWNER", name: "Acme" });
    expect(result.sourceClientAccountId).toBeUndefined();
  });
});
