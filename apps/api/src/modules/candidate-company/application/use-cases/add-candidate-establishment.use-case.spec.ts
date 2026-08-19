import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { UuidGenerator } from "../../../../shared-kernel/id-generator";
import {
  CandidateCompanyArchivedError,
  CandidateCompanyNotFoundError,
  DuplicateCandidateEstablishmentSiretError,
  DuplicatePrincipalCandidateEstablishmentError,
  InvalidSiretError,
} from "../../domain/errors";
import { FixedClock, InMemoryAuditLogWriter, InMemoryCandidateCompanyRepository } from "../../test-support/fakes";
import { AddCandidateEstablishmentUseCase } from "./add-candidate-establishment.use-case";
import { CreateCandidateCompanyUseCase } from "./create-candidate-company.use-case";

const ORG = randomUUID();
const ACTOR = randomUUID();
const VALID_SIRET_A = "35600000000048";
const VALID_SIRET_B = "39395385100010";

describe("AddCandidateEstablishmentUseCase", () => {
  let repository: InMemoryCandidateCompanyRepository;
  let auditLogWriter: InMemoryAuditLogWriter;
  let useCase: AddCandidateEstablishmentUseCase;
  let createCompanyUseCase: CreateCandidateCompanyUseCase;

  beforeEach(() => {
    repository = new InMemoryCandidateCompanyRepository();
    auditLogWriter = new InMemoryAuditLogWriter();
    useCase = new AddCandidateEstablishmentUseCase(repository, auditLogWriter, new FixedClock(), new UuidGenerator());
    createCompanyUseCase = new CreateCandidateCompanyUseCase(repository, auditLogWriter, new FixedClock(), new UuidGenerator());
  });

  it("adds an establishment to an existing candidate company", async () => {
    const company = await createCompanyUseCase.execute({ organizationId: ORG, actorId: ACTOR, name: "Acme" });
    const result = await useCase.execute({ organizationId: ORG, actorId: ACTOR, candidateCompanyId: company.id, siret: VALID_SIRET_A, city: "Paris" });
    expect(result.siret).toBe(VALID_SIRET_A);
    expect(result.candidateCompanyId).toBe(company.id);
  });

  it("rejects an invalid SIRET (fails Luhn checksum)", async () => {
    const company = await createCompanyUseCase.execute({ organizationId: ORG, actorId: ACTOR, name: "Acme" });
    await expect(
      useCase.execute({ organizationId: ORG, actorId: ACTOR, candidateCompanyId: company.id, siret: "35600000000049" }),
    ).rejects.toBeInstanceOf(InvalidSiretError);
  });

  it("throws CandidateCompanyNotFoundError for a non-existent (or cross-tenant) candidateCompanyId", async () => {
    await expect(
      useCase.execute({ organizationId: ORG, actorId: ACTOR, candidateCompanyId: randomUUID(), siret: VALID_SIRET_A }),
    ).rejects.toBeInstanceOf(CandidateCompanyNotFoundError);
  });

  it("refuses to add an establishment to an archived candidate company", async () => {
    const company = await createCompanyUseCase.execute({ organizationId: ORG, actorId: ACTOR, name: "Acme" });
    const archived = await repository.findById({ organizationId: ORG, candidateCompanyId: company.id });
    archived!.archive(new Date());
    await repository.save(archived!);

    await expect(
      useCase.execute({ organizationId: ORG, actorId: ACTOR, candidateCompanyId: company.id, siret: VALID_SIRET_A }),
    ).rejects.toBeInstanceOf(CandidateCompanyArchivedError);
  });

  it("rejects a duplicate SIRET within the same organization, even across two different candidate companies", async () => {
    const companyA = await createCompanyUseCase.execute({ organizationId: ORG, actorId: ACTOR, name: "Acme A" });
    const companyB = await createCompanyUseCase.execute({ organizationId: ORG, actorId: ACTOR, name: "Acme B" });
    await useCase.execute({ organizationId: ORG, actorId: ACTOR, candidateCompanyId: companyA.id, siret: VALID_SIRET_A });

    await expect(
      useCase.execute({ organizationId: ORG, actorId: ACTOR, candidateCompanyId: companyB.id, siret: VALID_SIRET_A }),
    ).rejects.toBeInstanceOf(DuplicateCandidateEstablishmentSiretError);
  });

  it("allows the same SIRET in a DIFFERENT organization", async () => {
    const company = await createCompanyUseCase.execute({ organizationId: ORG, actorId: ACTOR, name: "Acme" });
    await useCase.execute({ organizationId: ORG, actorId: ACTOR, candidateCompanyId: company.id, siret: VALID_SIRET_A });

    const otherOrg = randomUUID();
    const otherCompany = await createCompanyUseCase.execute({ organizationId: otherOrg, actorId: ACTOR, name: "Acme" });
    await expect(
      useCase.execute({ organizationId: otherOrg, actorId: ACTOR, candidateCompanyId: otherCompany.id, siret: VALID_SIRET_A }),
    ).resolves.toBeDefined();
  });

  it("allows exactly one principal establishment per candidate company, and identifies it", async () => {
    const company = await createCompanyUseCase.execute({ organizationId: ORG, actorId: ACTOR, name: "Acme" });
    const principal = await useCase.execute({
      organizationId: ORG,
      actorId: ACTOR,
      candidateCompanyId: company.id,
      siret: VALID_SIRET_A,
      isPrincipal: true,
      city: "Paris",
    });
    const secondary = await useCase.execute({
      organizationId: ORG,
      actorId: ACTOR,
      candidateCompanyId: company.id,
      siret: VALID_SIRET_B,
      isPrincipal: false,
      city: "Lyon",
    });

    expect(principal.isPrincipal).toBe(true);
    expect(secondary.isPrincipal).toBe(false);

    const establishments = await repository.listEstablishmentsByCompany({ organizationId: ORG, candidateCompanyId: company.id });
    const identifiedPrincipal = establishments.find((e) => e.isPrincipal);
    expect(identifiedPrincipal?.siret).toBe(VALID_SIRET_A);
  });

  it("rejects a second principal establishment for the same candidate company", async () => {
    const company = await createCompanyUseCase.execute({ organizationId: ORG, actorId: ACTOR, name: "Acme" });
    await useCase.execute({ organizationId: ORG, actorId: ACTOR, candidateCompanyId: company.id, siret: VALID_SIRET_A, isPrincipal: true });

    await expect(
      useCase.execute({ organizationId: ORG, actorId: ACTOR, candidateCompanyId: company.id, siret: VALID_SIRET_B, isPrincipal: true }),
    ).rejects.toBeInstanceOf(DuplicatePrincipalCandidateEstablishmentError);
  });

  it("records an audit log entry", async () => {
    const company = await createCompanyUseCase.execute({ organizationId: ORG, actorId: ACTOR, name: "Acme" });
    await useCase.execute({ organizationId: ORG, actorId: ACTOR, candidateCompanyId: company.id, siret: VALID_SIRET_A });
    expect(auditLogWriter.entries.map((e) => e.action)).toContain("candidate_establishment.created");
  });
});
