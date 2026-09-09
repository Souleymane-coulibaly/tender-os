import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { UuidGenerator } from "../../../../shared-kernel/id-generator";
import { FixedClock, InMemoryAuditLogWriter, InMemoryCandidateCompanyRepository } from "../../test-support/fakes";
import { AddCandidateEstablishmentUseCase } from "./add-candidate-establishment.use-case";
import { CreateCandidateCompanyUseCase } from "./create-candidate-company.use-case";
import { CandidateIdentitySource, ResolveCandidateIdentityUseCase } from "./resolve-candidate-identity.use-case";

const ORG_A = randomUUID();
const ORG_B = randomUUID();
const ACTOR = randomUUID();

describe("ResolveCandidateIdentityUseCase (Checkpoint 2.1-A4 — Candidate Context)", () => {
  let repository: InMemoryCandidateCompanyRepository;
  let createCandidateCompanyUseCase: CreateCandidateCompanyUseCase;
  let addCandidateEstablishmentUseCase: AddCandidateEstablishmentUseCase;
  let useCase: ResolveCandidateIdentityUseCase;

  beforeEach(() => {
    repository = new InMemoryCandidateCompanyRepository();
    const auditLogWriter = new InMemoryAuditLogWriter();
    const clock = new FixedClock();
    createCandidateCompanyUseCase = new CreateCandidateCompanyUseCase(repository, auditLogWriter, clock, new UuidGenerator());
    addCandidateEstablishmentUseCase = new AddCandidateEstablishmentUseCase(repository, auditLogWriter, clock, new UuidGenerator());
    useCase = new ResolveCandidateIdentityUseCase(repository);
  });

  it("LEGACY FLOW — returns source NONE when candidateCompanyId is absent (legacy Tender), never an error", async () => {
    const result = await useCase.execute({ organizationId: ORG_A });
    expect(result.source).toBe(CandidateIdentitySource.None);
  });

  it("returns source NONE (best-effort, never throws) when the candidateCompanyId does not exist", async () => {
    const result = await useCase.execute({ organizationId: ORG_A, candidateCompanyId: randomUUID() });
    expect(result.source).toBe(CandidateIdentitySource.None);
  });

  it("NEW FLOW — resolves identity (name/siren/legalForm) from CandidateCompany when set", async () => {
    const candidate = await createCandidateCompanyUseCase.execute({
      organizationId: ORG_A,
      actorId: ACTOR, actorRole: "OWNER",
      name: "Menuiserie Corentin SARL",
      siren: "356000000",
      legalForm: "SARL",
    });

    const result = await useCase.execute({ organizationId: ORG_A, candidateCompanyId: candidate.id });

    expect(result.source).toBe(CandidateIdentitySource.CandidateCompany);
    expect(result.displayName).toBe("Menuiserie Corentin SARL");
    expect(result.siren).toBe("356000000");
    expect(result.legalForm).toBe("SARL");
  });

  it("resolves the PRINCIPAL establishment only, never a secondary one substituted arbitrarily", async () => {
    const candidate = await createCandidateCompanyUseCase.execute({ organizationId: ORG_A, actorId: ACTOR, actorRole: "OWNER", name: "Alpha" });
    await addCandidateEstablishmentUseCase.execute({
      organizationId: ORG_A,
      actorId: ACTOR, actorRole: "OWNER",
      candidateCompanyId: candidate.id,
      siret: "39395385100010",
      isPrincipal: false,
      city: "Lyon",
    });
    await addCandidateEstablishmentUseCase.execute({
      organizationId: ORG_A,
      actorId: ACTOR, actorRole: "OWNER",
      candidateCompanyId: candidate.id,
      siret: "35600000000048",
      isPrincipal: true,
      city: "Paris",
    });

    const result = await useCase.execute({ organizationId: ORG_A, candidateCompanyId: candidate.id });

    expect(result.principalEstablishment?.siret).toBe("35600000000048");
    expect(result.principalEstablishment?.city).toBe("Paris");
  });

  it("leaves principalEstablishment undefined when no establishment is a declared principal (never a guessed substitute)", async () => {
    const candidate = await createCandidateCompanyUseCase.execute({ organizationId: ORG_A, actorId: ACTOR, actorRole: "OWNER", name: "Alpha" });
    await addCandidateEstablishmentUseCase.execute({
      organizationId: ORG_A,
      actorId: ACTOR, actorRole: "OWNER",
      candidateCompanyId: candidate.id,
      siret: "35600000000048",
      isPrincipal: false,
    });

    const result = await useCase.execute({ organizationId: ORG_A, candidateCompanyId: candidate.id });

    expect(result.principalEstablishment).toBeUndefined();
  });

  it("multi-tenant: never resolves a CandidateCompany belonging to a different organization", async () => {
    const candidateOrgA = await createCandidateCompanyUseCase.execute({ organizationId: ORG_A, actorId: ACTOR, actorRole: "OWNER", name: "Alpha" });

    const result = await useCase.execute({ organizationId: ORG_B, candidateCompanyId: candidateOrgA.id });

    expect(result.source).toBe(CandidateIdentitySource.None);
  });

  it("multi-candidate: two CandidateCompany in the same organization resolve independently, never mixed", async () => {
    const alpha = await createCandidateCompanyUseCase.execute({ organizationId: ORG_A, actorId: ACTOR, actorRole: "OWNER", name: "Alpha", siren: "356000000" });
    const beta = await createCandidateCompanyUseCase.execute({ organizationId: ORG_A, actorId: ACTOR, actorRole: "OWNER", name: "Beta" });

    const resultAlpha = await useCase.execute({ organizationId: ORG_A, candidateCompanyId: alpha.id });
    const resultBeta = await useCase.execute({ organizationId: ORG_A, candidateCompanyId: beta.id });

    expect(resultAlpha.displayName).toBe("Alpha");
    expect(resultAlpha.siren).toBe("356000000");
    expect(resultBeta.displayName).toBe("Beta");
    expect(resultBeta.siren).toBeUndefined();
  });

  it("falls back displayName to the raw name when legalName is not set", async () => {
    const candidate = await createCandidateCompanyUseCase.execute({ organizationId: ORG_A, actorId: ACTOR, actorRole: "OWNER", name: "Alpha Travaux" });
    const result = await useCase.execute({ organizationId: ORG_A, candidateCompanyId: candidate.id });
    expect(result.displayName).toBe("Alpha Travaux");
  });
});
