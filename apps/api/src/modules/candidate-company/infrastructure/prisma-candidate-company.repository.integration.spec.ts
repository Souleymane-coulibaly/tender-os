import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { CandidateCompany } from "../domain/candidate-company.aggregate";
import { CandidateEstablishment } from "../domain/candidate-establishment.entity";
import { DuplicateCandidateCompanyNameError, DuplicateCandidateEstablishmentSiretError } from "../domain/errors";
import { PrismaCandidateCompanyRepository } from "./prisma-candidate-company.repository";

/**
 * Mission TenderOS 2.1-A1 §26-29 — preuve PostgreSQL réelle des garanties que le fake en mémoire ne
 * peut pas démontrer : la contrainte `@@unique([organizationId, siret])` protège réellement contre
 * une double création concurrente, l'index unique PARTIEL "un seul établissement principal par
 * entreprise candidate" (écrit à la main, non exprimable dans le DSL Prisma) rejette effectivement
 * un second principal, et `ON DELETE CASCADE` supprime bien les CandidateEstablishment quand leur
 * CandidateCompany parente est supprimée (mission §"cascade/delete behavior sûr").
 *
 * Nécessite une vraie PostgreSQL — non exécutable dans le sandbox de développement de cette session
 * (déjà observé pour toutes les autres suites `*.integration.spec.ts` de ce dépôt : `Can't reach
 * database server at localhost:5432`). À exécuter en CI / avec une base réelle.
 */
describe("CandidateCompany / CandidateEstablishment repositories (PostgreSQL réel)", () => {
  const prisma = new PrismaService();
  const repository = new PrismaCandidateCompanyRepository(prisma);

  const organizationId = randomUUID();
  const otherOrganizationId = randomUUID();
  const now = new Date("2026-08-17T10:00:00Z");

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.createMany({
      data: [
        { id: organizationId, name: "Candidate Company Repo Test Org", slug: `candidate-company-repo-test-org-${organizationId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
        {
          id: otherOrganizationId,
          name: "Candidate Company Repo Test Org (other)",
          slug: `candidate-company-repo-test-org-other-${otherOrganizationId}`,
          defaultTimezone: "Europe/Paris",
          status: "TRIAL",
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.candidateEstablishment.deleteMany({ where: { organizationId: { in: [organizationId, otherOrganizationId] } } });
    await prisma.candidateCompany.deleteMany({ where: { organizationId: { in: [organizationId, otherOrganizationId] } } });
    await prisma.organization.deleteMany({ where: { id: { in: [organizationId, otherOrganizationId] } } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.candidateEstablishment.deleteMany({ where: { organizationId: { in: [organizationId, otherOrganizationId] } } });
    await prisma.candidateCompany.deleteMany({ where: { organizationId: { in: [organizationId, otherOrganizationId] } } });
  });

  function newCompany(overrides: Partial<Parameters<typeof CandidateCompany.create>[0]> = {}) {
    return CandidateCompany.create({
      id: randomUUID(),
      organizationId,
      name: "Acme Travaux Publics",
      createdBy: randomUUID(),
      occurredAt: now,
      ...overrides,
    });
  }

  it("persists a CandidateCompany and reads it back with the same shape", async () => {
    const company = newCompany({ siren: "356000000" });
    await repository.create(company);

    const found = await repository.findById({ organizationId, candidateCompanyId: company.id });
    expect(found?.name).toBe("Acme Travaux Publics");
    expect(found?.siren).toBe("356000000");
    expect(found?.status).toBe("ACTIVE");
  });

  it("DB-level: rejects a duplicate normalized name within the same organization (@@unique([organizationId, nameNormalized]))", async () => {
    await repository.create(newCompany({ name: "Acme" }));
    await expect(repository.create(newCompany({ name: "  ACME  " }))).rejects.toBeInstanceOf(DuplicateCandidateCompanyNameError);
  });

  it("DB-level: rejects a duplicate SIRET within the same organization, even across two different candidate companies (@@unique([organizationId, siret]))", async () => {
    const companyA = newCompany({ name: "Acme A" });
    const companyB = newCompany({ name: "Acme B" });
    await repository.create(companyA);
    await repository.create(companyB);

    const establishmentA = CandidateEstablishment.create({
      id: randomUUID(),
      organizationId,
      candidateCompanyId: companyA.id,
      siret: "35600000000048",
      createdBy: randomUUID(),
      occurredAt: now,
    });
    const establishmentB = CandidateEstablishment.create({
      id: randomUUID(),
      organizationId,
      candidateCompanyId: companyB.id,
      siret: "35600000000048",
      createdBy: randomUUID(),
      occurredAt: now,
    });

    await repository.createEstablishment(establishmentA);
    await expect(repository.createEstablishment(establishmentB)).rejects.toBeInstanceOf(DuplicateCandidateEstablishmentSiretError);
  });

  it("DB-level: rejects a second principal establishment for the same candidate company (partial unique index)", async () => {
    const company = newCompany();
    await repository.create(company);

    const first = CandidateEstablishment.create({
      id: randomUUID(),
      organizationId,
      candidateCompanyId: company.id,
      siret: "35600000000048",
      isPrincipal: true,
      createdBy: randomUUID(),
      occurredAt: now,
    });
    const second = CandidateEstablishment.create({
      id: randomUUID(),
      organizationId,
      candidateCompanyId: company.id,
      siret: "39395385100010",
      isPrincipal: true,
      createdBy: randomUUID(),
      occurredAt: now,
    });

    await repository.createEstablishment(first);
    await expect(repository.createEstablishment(second)).rejects.toBeDefined();
  });

  it("safe cascade delete: deleting a CandidateCompany deletes its CandidateEstablishment rows (ON DELETE CASCADE)", async () => {
    const company = newCompany();
    await repository.create(company);
    const establishment = CandidateEstablishment.create({
      id: randomUUID(),
      organizationId,
      candidateCompanyId: company.id,
      siret: "35600000000048",
      createdBy: randomUUID(),
      occurredAt: now,
    });
    await repository.createEstablishment(establishment);

    await prisma.candidateCompany.delete({ where: { id: company.id } });

    const remaining = await prisma.candidateEstablishment.findUnique({ where: { id: establishment.id } });
    expect(remaining).toBeNull();
  });

  it("multi-tenant: a CandidateCompany created in one organization is invisible from another organization", async () => {
    const company = newCompany();
    await repository.create(company);

    const foundFromOtherOrg = await repository.findById({ organizationId: otherOrganizationId, candidateCompanyId: company.id });
    expect(foundFromOtherOrg).toBeNull();
  });

  it("DB-level: rejects an out-of-catalog status via the hand-written CHECK constraint", async () => {
    const company = newCompany();
    await expect(
      prisma.$executeRaw`INSERT INTO candidate_companies (id, organization_id, name, name_normalized, status, created_by, updated_at)
        VALUES (${company.id}::uuid, ${organizationId}::uuid, 'Bad Status Co', 'bad status co', 'NOT_A_STATUS', ${randomUUID()}::uuid, now())`,
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });
});
