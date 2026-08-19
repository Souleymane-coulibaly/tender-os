import { randomUUID } from "node:crypto";
import { Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { DatabaseModule } from "../../../shared-kernel/database.module";
import { SharedKernelModule } from "../../../shared-kernel/shared-kernel.module";
import { CLOCK } from "../../../shared-kernel/clock";
import type { Clock } from "../../../shared-kernel/clock";
import { ClientPortfolioModule } from "../../client-portfolio/client-portfolio.module";
import { ListClientAccountsUseCase } from "../../client-portfolio/application/use-cases/list-client-accounts.use-case";
import { CompanyProfileModule } from "../../company-profile";
import { GetCompanyProfileUseCase } from "../../company-profile/application/use-cases/get-company-profile.use-case";
import { IdentityModule } from "../../identity";
import { MembershipsModule } from "../../memberships";
import { CandidateCompanyModule } from "../candidate-company.module";
import { CANDIDATE_COMPANY_REPOSITORY } from "../application/ports/candidate-company.repository";
import type { CandidateCompanyRepository } from "../application/ports/candidate-company.repository";
import { AddCandidateEstablishmentUseCase } from "../application/use-cases/add-candidate-establishment.use-case";
import { CreateCandidateCompanyUseCase } from "../application/use-cases/create-candidate-company.use-case";
import { runCandidateCompanyBackfill } from "./backfill-from-client-accounts";

/**
 * Mission TenderOS 2.1-A2 §45 — preuve PostgreSQL réelle : création candidate/établissement,
 * idempotence, isolation multi-tenant, persistance SIREN/SIRET, préservation du legacy. Réutilise le
 * VRAI graphe Nest (`ListClientAccountsUseCase`/`GetCompanyProfileUseCase`) plutôt que des fakes —
 * même composition de modules que `backfill-from-client-accounts.cli.ts` (jamais `AppModule` complet,
 * pour ne pas démarrer les workers Outbox/market-watch pendant le test).
 *
 * Nécessite une vraie PostgreSQL — non exécutable dans le sandbox de développement de cette session
 * (déjà observé pour toutes les autres suites `*.integration.spec.ts` de ce dépôt : `Can't reach
 * database server at localhost:5432`). À exécuter en CI / avec une base réelle.
 */
@Module({ imports: [SharedKernelModule, DatabaseModule, IdentityModule, MembershipsModule, ClientPortfolioModule, CompanyProfileModule, CandidateCompanyModule] })
class TestBackfillModule {}

describe("runCandidateCompanyBackfill — PostgreSQL réel", () => {
  let prisma: PrismaService;
  let listClientAccountsUseCase: ListClientAccountsUseCase;
  let getCompanyProfileUseCase: GetCompanyProfileUseCase;
  let candidateCompanyRepository: CandidateCompanyRepository;
  let createCandidateCompanyUseCase: CreateCandidateCompanyUseCase;
  let addCandidateEstablishmentUseCase: AddCandidateEstablishmentUseCase;
  let clock: Clock;

  const organizationId = randomUUID();
  const otherOrganizationId = randomUUID();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [TestBackfillModule] }).compile();
    prisma = moduleRef.get(PrismaService);
    listClientAccountsUseCase = moduleRef.get(ListClientAccountsUseCase);
    getCompanyProfileUseCase = moduleRef.get(GetCompanyProfileUseCase);
    candidateCompanyRepository = moduleRef.get(CANDIDATE_COMPANY_REPOSITORY);
    createCandidateCompanyUseCase = moduleRef.get(CreateCandidateCompanyUseCase);
    addCandidateEstablishmentUseCase = moduleRef.get(AddCandidateEstablishmentUseCase);
    clock = moduleRef.get(CLOCK);

    await prisma.$connect();
    await prisma.organization.createMany({
      data: [
        { id: organizationId, name: "Backfill Test Org", slug: `backfill-test-org-${organizationId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
        { id: otherOrganizationId, name: "Backfill Test Org (other)", slug: `backfill-test-org-other-${otherOrganizationId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
      ],
    });
  });

  afterAll(async () => {
    await prisma.candidateEstablishment.deleteMany({ where: { organizationId: { in: [organizationId, otherOrganizationId] } } });
    await prisma.candidateCompany.deleteMany({ where: { organizationId: { in: [organizationId, otherOrganizationId] } } });
    await prisma.companyLegalIdentity.deleteMany({ where: { organizationId: { in: [organizationId, otherOrganizationId] } } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: { in: [organizationId, otherOrganizationId] } } });
    // `CreateCandidateCompanyUseCase`/`AddCandidateEstablishmentUseCase` écrivent dans `audit_logs`
    // (mécanisme canonique) — doit être purgé avant l'organisation elle-même (FK `audit_logs_organization_id_fkey`).
    await prisma.auditLog.deleteMany({ where: { organizationId: { in: [organizationId, otherOrganizationId] } } });
    await prisma.organization.deleteMany({ where: { id: { in: [organizationId, otherOrganizationId] } } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.candidateEstablishment.deleteMany({ where: { organizationId: { in: [organizationId, otherOrganizationId] } } });
    await prisma.candidateCompany.deleteMany({ where: { organizationId: { in: [organizationId, otherOrganizationId] } } });
    await prisma.companyLegalIdentity.deleteMany({ where: { organizationId: { in: [organizationId, otherOrganizationId] } } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: { in: [organizationId, otherOrganizationId] } } });
  });

  function deps() {
    return { clientAccountLister: listClientAccountsUseCase, companyProfileReader: getCompanyProfileUseCase, candidateCompanyRepository, createCandidateCompanyUseCase, addCandidateEstablishmentUseCase, clock };
  }

  async function seedClientAccountWithLegalIdentity(input: { orgId: string; name: string; siren: string | null; siretPrincipal: string | null }) {
    const clientAccountId = randomUUID();
    const createdBy = randomUUID();
    await prisma.clientAccount.create({
      data: { id: clientAccountId, organizationId: input.orgId, name: input.name, nameNormalized: input.name.toLowerCase(), status: "ACTIVE", createdBy },
    });
    await prisma.companyLegalIdentity.create({
      data: {
        id: randomUUID(),
        organizationId: input.orgId,
        clientAccountId,
        status: "ACTIVE",
        legalName: input.name,
        siren: input.siren,
        siretPrincipal: input.siretPrincipal,
        addressLine: "1 rue de Test",
        postalCode: "75001",
        city: "Paris",
        country: "FR",
        createdBy,
      },
    });
    return clientAccountId;
  }

  it("creates a CandidateCompany + CandidateEstablishment from a real ClientAccount/CompanyLegalIdentity, and never mutates the legacy rows", async () => {
    const clientAccountId = await seedClientAccountWithLegalIdentity({ orgId: organizationId, name: "Menuiserie Corentin SARL", siren: "356000000", siretPrincipal: "35600000000048" });

    const summary = await runCandidateCompanyBackfill(deps(), { organizationId, dryRun: false });

    expect(summary.migrated).toBe(1);
    const created = await candidateCompanyRepository.findBySourceClientAccountId({ organizationId, sourceClientAccountId: clientAccountId });
    expect(created?.siren).toBe("356000000");

    const establishments = await candidateCompanyRepository.listEstablishmentsByCompany({ organizationId, candidateCompanyId: created!.id });
    expect(establishments).toHaveLength(1);
    expect(establishments[0]?.siret).toBe("35600000000048");

    // Legacy jamais muté (mission §16/§21) — vérifié directement en base, pas via le domaine.
    const legacyClientAccount = await prisma.clientAccount.findUniqueOrThrow({ where: { id: clientAccountId } });
    const legacyLegalIdentity = await prisma.companyLegalIdentity.findUniqueOrThrow({ where: { clientAccountId_organizationId: { clientAccountId, organizationId } } });
    expect(legacyClientAccount.name).toBe("Menuiserie Corentin SARL");
    expect(legacyLegalIdentity.siren).toBe("356000000");
  });

  it("idempotence: re-running the backfill against real PostgreSQL never duplicates a CandidateCompany or a CandidateEstablishment", async () => {
    await seedClientAccountWithLegalIdentity({ orgId: organizationId, name: "Toiture Bernard SARL", siren: "356000000", siretPrincipal: "35600000000048" });

    await runCandidateCompanyBackfill(deps(), { organizationId, dryRun: false });
    const secondRun = await runCandidateCompanyBackfill(deps(), { organizationId, dryRun: false });

    expect(secondRun.migrated).toBe(0);
    expect(secondRun.alreadyMigrated).toBe(1);
    const list = await candidateCompanyRepository.list({ organizationId, includeArchived: true, limit: 100 });
    expect(list.items).toHaveLength(1);
  });

  it("multi-tenant: a backfill scoped to one organization never creates a CandidateCompany in another organization", async () => {
    await seedClientAccountWithLegalIdentity({ orgId: organizationId, name: "Candidat Org A", siren: "356000000", siretPrincipal: "35600000000048" });
    await seedClientAccountWithLegalIdentity({ orgId: otherOrganizationId, name: "Candidat Org B", siren: "356000000", siretPrincipal: "39395385100010" });

    await runCandidateCompanyBackfill(deps(), { organizationId, dryRun: false });

    const listA = await candidateCompanyRepository.list({ organizationId, includeArchived: true, limit: 100 });
    const listB = await candidateCompanyRepository.list({ organizationId: otherOrganizationId, includeArchived: true, limit: 100 });
    expect(listA.items).toHaveLength(1);
    expect(listB.items).toHaveLength(0); // pas migrée : on n'a lancé le backfill que pour `organizationId`
  });

  it("dry-run against real PostgreSQL writes nothing", async () => {
    await seedClientAccountWithLegalIdentity({ orgId: organizationId, name: "Isolation SAS", siren: "356000000", siretPrincipal: "35600000000048" });

    const summary = await runCandidateCompanyBackfill(deps(), { organizationId, dryRun: true });

    expect(summary.eligible).toBe(1);
    const list = await candidateCompanyRepository.list({ organizationId, includeArchived: true, limit: 100 });
    expect(list.items).toHaveLength(0);
  });
});
