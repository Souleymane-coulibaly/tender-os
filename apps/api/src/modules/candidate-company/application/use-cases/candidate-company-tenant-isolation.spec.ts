import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { UuidGenerator } from "../../../../shared-kernel/id-generator";
import { CandidateCompanyNotFoundError } from "../../domain/errors";
import { FixedClock, InMemoryAuditLogWriter, InMemoryCandidateCompanyRepository } from "../../test-support/fakes";
import { AddCandidateEstablishmentUseCase } from "./add-candidate-establishment.use-case";
import { CreateCandidateCompanyUseCase } from "./create-candidate-company.use-case";
import { GetCandidateCompanyUseCase } from "./get-candidate-company.use-case";
import { ListCandidateCompaniesUseCase } from "./list-candidate-companies.use-case";
import { ListCandidateEstablishmentsUseCase } from "./list-candidate-establishments.use-case";

/**
 * Mission TenderOS 2.1-A1 §26-29 — preuves explicites d'isolation multi-tenant, de coexistence
 * multi-candidat et de distinction multi-établissement, exigées indépendamment des tests unitaires
 * "à la marge" déjà couverts par create-candidate-company/add-candidate-establishment.use-case.spec.ts.
 */
describe("CandidateCompany — isolation multi-tenant / multi-candidat / multi-établissement", () => {
  const ORG_A = randomUUID();
  const ORG_B = randomUUID();
  const ACTOR = randomUUID();

  let repository: InMemoryCandidateCompanyRepository;
  let auditLogWriter: InMemoryAuditLogWriter;
  let createCompanyUseCase: CreateCandidateCompanyUseCase;
  let getCompanyUseCase: GetCandidateCompanyUseCase;
  let listCompaniesUseCase: ListCandidateCompaniesUseCase;
  let addEstablishmentUseCase: AddCandidateEstablishmentUseCase;
  let listEstablishmentsUseCase: ListCandidateEstablishmentsUseCase;

  beforeEach(() => {
    repository = new InMemoryCandidateCompanyRepository();
    auditLogWriter = new InMemoryAuditLogWriter();
    createCompanyUseCase = new CreateCandidateCompanyUseCase(repository, auditLogWriter, new FixedClock(), new UuidGenerator());
    getCompanyUseCase = new GetCandidateCompanyUseCase(repository);
    listCompaniesUseCase = new ListCandidateCompaniesUseCase(repository);
    addEstablishmentUseCase = new AddCandidateEstablishmentUseCase(repository, auditLogWriter, new FixedClock(), new UuidGenerator());
    listEstablishmentsUseCase = new ListCandidateEstablishmentsUseCase(repository);
  });

  it("multi-tenant: Org A / Candidat Alpha and Org B / Candidat Beta never collide, and cross-org access fails as 404-shaped (never a data leak)", async () => {
    const alpha = await createCompanyUseCase.execute({ organizationId: ORG_A, actorId: ACTOR, actorRole: "OWNER", name: "Alpha" });
    const beta = await createCompanyUseCase.execute({ organizationId: ORG_B, actorId: ACTOR, actorRole: "OWNER", name: "Beta" });

    // Chaque organisation ne voit que son propre candidat.
    await expect(getCompanyUseCase.execute({ organizationId: ORG_A, candidateCompanyId: alpha.id })).resolves.toMatchObject({ name: "Alpha" });
    await expect(getCompanyUseCase.execute({ organizationId: ORG_B, candidateCompanyId: beta.id })).resolves.toMatchObject({ name: "Beta" });

    // Un acteur de l'organisation B ne peut structurellement pas accéder au candidat de l'organisation A
    // (et réciproquement) — même erreur "not found" que pour un identifiant inexistant, jamais un 403
    // qui révélerait l'existence de la ressource (mission §"jamais 403, toujours 404").
    await expect(getCompanyUseCase.execute({ organizationId: ORG_B, candidateCompanyId: alpha.id })).rejects.toBeInstanceOf(CandidateCompanyNotFoundError);
    await expect(getCompanyUseCase.execute({ organizationId: ORG_A, candidateCompanyId: beta.id })).rejects.toBeInstanceOf(CandidateCompanyNotFoundError);
  });

  it("multi-tenant: listing candidate companies is strictly scoped to the caller's organization", async () => {
    await createCompanyUseCase.execute({ organizationId: ORG_A, actorId: ACTOR, actorRole: "OWNER", name: "Alpha" });
    await createCompanyUseCase.execute({ organizationId: ORG_B, actorId: ACTOR, actorRole: "OWNER", name: "Beta" });

    const listForA = await listCompaniesUseCase.execute({ organizationId: ORG_A, actorRole: "OWNER" });
    const listForB = await listCompaniesUseCase.execute({ organizationId: ORG_B, actorRole: "OWNER" });

    expect(listForA.items.map((c) => c.name)).toEqual(["Alpha"]);
    expect(listForB.items.map((c) => c.name)).toEqual(["Beta"]);
  });

  it("multi-candidate: Org A can hold Alpha and Beta as two independent, coexisting candidate companies", async () => {
    const alpha = await createCompanyUseCase.execute({ organizationId: ORG_A, actorId: ACTOR, actorRole: "OWNER", name: "Alpha" });
    const beta = await createCompanyUseCase.execute({ organizationId: ORG_A, actorId: ACTOR, actorRole: "OWNER", name: "Beta" });

    expect(alpha.id).not.toBe(beta.id);
    const list = await listCompaniesUseCase.execute({ organizationId: ORG_A, actorRole: "OWNER" });
    expect(list.total).toBe(2);
    expect(list.items.map((c) => c.name).sort()).toEqual(["Alpha", "Beta"]);
  });

  it("multi-establishment: Candidat Alpha has a Paris establishment and a distinct Lyon establishment, both listable and never conflated", async () => {
    const alpha = await createCompanyUseCase.execute({ organizationId: ORG_A, actorId: ACTOR, actorRole: "OWNER", name: "Alpha" });

    const paris = await addEstablishmentUseCase.execute({
      organizationId: ORG_A,
      actorId: ACTOR, actorRole: "OWNER",
      candidateCompanyId: alpha.id,
      siret: "35600000000048",
      isPrincipal: true,
      city: "Paris",
    });
    const lyon = await addEstablishmentUseCase.execute({
      organizationId: ORG_A,
      actorId: ACTOR, actorRole: "OWNER",
      candidateCompanyId: alpha.id,
      siret: "39395385100010",
      isPrincipal: false,
      city: "Lyon",
    });

    expect(paris.id).not.toBe(lyon.id);
    expect(paris.siret).not.toBe(lyon.siret);

    const establishments = await repository.listEstablishmentsByCompany({ organizationId: ORG_A, candidateCompanyId: alpha.id });
    expect(establishments).toHaveLength(2);
    expect(establishments.map((e) => e.city).sort()).toEqual(["Lyon", "Paris"]);
    expect(establishments.find((e) => e.isPrincipal)?.city).toBe("Paris");
  });

  /**
   * Checkpoint 2.1-A6.4 (DEFERRED-BE-04) — `ListCandidateEstablishmentsUseCase`, jusqu'ici absent
   * (mission §56-61/§66) : ordre déterministe (principal d'abord), état vide, isolation multi-
   * candidat/multi-org (IDOR — jamais 200 vide indistinguable d'un 404 côté HTTP, voir le contrôleur).
   */
  it("TEST LISTING (mission §56) — Candidat Alpha with Paris (principal) and Lyon returns both, principal first, never a company-info leak", async () => {
    const alpha = await createCompanyUseCase.execute({ organizationId: ORG_A, actorId: ACTOR, actorRole: "OWNER", name: "Alpha" });
    await addEstablishmentUseCase.execute({ organizationId: ORG_A, actorId: ACTOR, actorRole: "OWNER", candidateCompanyId: alpha.id, siret: "39395385100010", isPrincipal: false, city: "Lyon" });
    await addEstablishmentUseCase.execute({ organizationId: ORG_A, actorId: ACTOR, actorRole: "OWNER", candidateCompanyId: alpha.id, siret: "35600000000048", isPrincipal: true, city: "Paris" });

    const result = await listEstablishmentsUseCase.execute({ organizationId: ORG_A, candidateCompanyId: alpha.id, actorRole: "OWNER" });

    expect(result.map((e) => e.city)).toEqual(["Paris", "Lyon"]);
    expect(result[0]?.isPrincipal).toBe(true);
  });

  it("TEST EMPTY (mission §57) — a CandidateCompany with no establishment yet returns [], never a crash", async () => {
    const alpha = await createCompanyUseCase.execute({ organizationId: ORG_A, actorId: ACTOR, actorRole: "OWNER", name: "Alpha" });

    const result = await listEstablishmentsUseCase.execute({ organizationId: ORG_A, candidateCompanyId: alpha.id, actorRole: "OWNER" });

    expect(result).toEqual([]);
  });

  it("TEST CANDIDATE ISOLATION (mission §58) — Alpha's Paris establishment never appears when listing Beta, and vice versa", async () => {
    const alpha = await createCompanyUseCase.execute({ organizationId: ORG_A, actorId: ACTOR, actorRole: "OWNER", name: "Alpha" });
    const beta = await createCompanyUseCase.execute({ organizationId: ORG_A, actorId: ACTOR, actorRole: "OWNER", name: "Beta" });
    await addEstablishmentUseCase.execute({ organizationId: ORG_A, actorId: ACTOR, actorRole: "OWNER", candidateCompanyId: alpha.id, siret: "35600000000048", city: "Paris" });
    await addEstablishmentUseCase.execute({ organizationId: ORG_A, actorId: ACTOR, actorRole: "OWNER", candidateCompanyId: beta.id, siret: "39395385100010", city: "Lyon" });

    const alphaListing = await listEstablishmentsUseCase.execute({ organizationId: ORG_A, candidateCompanyId: alpha.id, actorRole: "OWNER" });
    const betaListing = await listEstablishmentsUseCase.execute({ organizationId: ORG_A, candidateCompanyId: beta.id, actorRole: "OWNER" });

    expect(alphaListing.map((e) => e.city)).toEqual(["Paris"]);
    expect(betaListing.map((e) => e.city)).toEqual(["Lyon"]);
  });

  it("TEST ORG ISOLATION / IDOR (mission §59/§66) — Org B can never list Org A's establishments by candidateCompanyId, even a valid one — 404-shaped, never an empty-but-different-org leak", async () => {
    const alpha = await createCompanyUseCase.execute({ organizationId: ORG_A, actorId: ACTOR, actorRole: "OWNER", name: "Alpha" });
    await addEstablishmentUseCase.execute({ organizationId: ORG_A, actorId: ACTOR, actorRole: "OWNER", candidateCompanyId: alpha.id, siret: "35600000000048", city: "Paris" });

    await expect(listEstablishmentsUseCase.execute({ organizationId: ORG_B, candidateCompanyId: alpha.id, actorRole: "OWNER" })).rejects.toBeInstanceOf(CandidateCompanyNotFoundError);
  });

  it("listing a candidateCompanyId that does not exist at all fails the same way as a cross-org one (never distinguishable)", async () => {
    await expect(listEstablishmentsUseCase.execute({ organizationId: ORG_A, candidateCompanyId: randomUUID(), actorRole: "OWNER" })).rejects.toBeInstanceOf(CandidateCompanyNotFoundError);
  });
});
