import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { Consortium, ConsortiumType } from "../domain/consortium.aggregate";
import { Dc1CandidateType, Dc1Declaration } from "../domain/dc1-declaration.aggregate";
import { Dc2Declaration } from "../domain/dc2-declaration.aggregate";
import { Dc2DeclarationVersion } from "../domain/dc2-declaration-version.entity";
import { DumeDeclaration } from "../domain/dume-declaration.aggregate";
import { DumeDeclarationVersion } from "../domain/dume-declaration-version.entity";
import { SubcontractorDeclaration } from "../domain/subcontractor-declaration.aggregate";
import { EngagementAct } from "../domain/engagement-act.aggregate";
import { SigningPower } from "../domain/signing-power.aggregate";
import { DuplicateConsortiumError, DuplicateDc1DeclarationError, DuplicateDc2DeclarationError, DuplicateDumeDeclarationError, DuplicateEngagementActError } from "../domain/errors";
import { PrismaConsortiumRepository } from "./prisma-consortium.repository";
import { PrismaDc1DeclarationRepository } from "./prisma-dc1-declaration.repository";
import { PrismaDc2DeclarationRepository, PrismaDc2DeclarationVersionRepository } from "./prisma-dc2-declaration.repository";
import { PrismaDumeDeclarationRepository, PrismaDumeDeclarationVersionRepository } from "./prisma-dume-declaration.repository";
import { PrismaSubcontractorDeclarationRepository } from "./prisma-subcontractor-declaration.repository";
import { PrismaEngagementActRepository } from "./prisma-engagement-act.repository";
import { PrismaSigningPowerRepository } from "./prisma-signing-power.repository";

/**
 * Sprint 8C Phase 2 — preuve PostgreSQL réelle pour les 9 nouveaux agrégats (même motif que
 * `prisma-administrative-dossier.repository.integration.spec.ts` en Phase 1) : round-trip pour
 * chacun, `@@unique([organizationId, tenderId])` protège réellement les agrégats "un par Tender"
 * contre une double création concurrente, et une CHECK constraint hand-appended rejette une valeur
 * hors catalogue.
 */
describe("Administrative Dossier — structured declarations repositories (PostgreSQL réel)", () => {
  const prisma = new PrismaService();
  const consortiumRepository = new PrismaConsortiumRepository(prisma);
  const dc1Repository = new PrismaDc1DeclarationRepository(prisma);
  const dc2Repository = new PrismaDc2DeclarationRepository(prisma);
  const dc2VersionRepository = new PrismaDc2DeclarationVersionRepository(prisma);
  const dumeRepository = new PrismaDumeDeclarationRepository(prisma);
  const dumeVersionRepository = new PrismaDumeDeclarationVersionRepository(prisma);
  const subcontractorRepository = new PrismaSubcontractorDeclarationRepository(prisma);
  const engagementActRepository = new PrismaEngagementActRepository(prisma);
  const signingPowerRepository = new PrismaSigningPowerRepository(prisma);

  const organizationId = randomUUID();
  const clientAccountId = randomUUID();
  const tenderId = randomUUID();
  const now = new Date("2026-09-10T10:00:00Z");

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.create({ data: { id: organizationId, name: "Structured Declarations Repo Test Org", slug: `structured-repo-test-org-${organizationId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" } });
    await prisma.clientAccount.create({ data: { id: clientAccountId, organizationId, name: "Client", nameNormalized: "client", status: "ACTIVE", createdBy: randomUUID() } });
    await prisma.tender.create({ data: { id: tenderId, organizationId, clientAccountId, title: "Marché de test", status: "DRAFT", tags: [], createdBy: randomUUID() } });
  });

  afterAll(async () => {
    await prisma.subcontractorDeclaration.deleteMany({ where: { organizationId } });
    await prisma.signingPower.deleteMany({ where: { organizationId } });
    await prisma.engagementAct.deleteMany({ where: { organizationId } });
    await prisma.dc2DeclarationVersion.deleteMany({ where: { organizationId } });
    await prisma.dc2Declaration.deleteMany({ where: { organizationId } });
    await prisma.dumeDeclarationVersion.deleteMany({ where: { organizationId } });
    await prisma.dumeDeclaration.deleteMany({ where: { organizationId } });
    await prisma.dc1Declaration.deleteMany({ where: { organizationId } });
    await prisma.consortium.deleteMany({ where: { organizationId } });
    await prisma.tender.deleteMany({ where: { organizationId } });
    await prisma.clientAccount.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.subcontractorDeclaration.deleteMany({ where: { organizationId } });
    await prisma.signingPower.deleteMany({ where: { organizationId } });
    await prisma.engagementAct.deleteMany({ where: { organizationId } });
    await prisma.dc2DeclarationVersion.deleteMany({ where: { organizationId } });
    await prisma.dc2Declaration.deleteMany({ where: { organizationId } });
    await prisma.dumeDeclarationVersion.deleteMany({ where: { organizationId } });
    await prisma.dumeDeclaration.deleteMany({ where: { organizationId } });
    await prisma.dc1Declaration.deleteMany({ where: { organizationId } });
    await prisma.consortium.deleteMany({ where: { organizationId } });
  });

  it("Consortium round-trips, including JSON members, and @@unique([organizationId, tenderId]) rejects a second one for the same tender", async () => {
    const consortium = Consortium.create({ id: randomUUID(), organizationId, tenderId, type: ConsortiumType.Joint, createdBy: randomUUID(), occurredAt: now });
    consortium.setMembers({ members: [{ memberId: "m1", name: "Membre 1", role: "mandataire", percentage: 60 }], occurredAt: now });
    await consortiumRepository.create(consortium);

    const found = await consortiumRepository.findByTenderId({ organizationId, tenderId });
    expect(found?.members).toHaveLength(1);
    expect(found?.members[0]?.name).toBe("Membre 1");

    const duplicate = Consortium.create({ id: randomUUID(), organizationId, tenderId, type: ConsortiumType.Solidarity, createdBy: randomUUID(), occurredAt: now });
    await expect(consortiumRepository.create(duplicate)).rejects.toBeInstanceOf(DuplicateConsortiumError);
  });

  it("rejects an invalid Consortium type at the database level (hand-appended CHECK constraint)", async () => {
    const id = randomUUID();
    await expect(
      prisma.$executeRaw`INSERT INTO administrative_consortiums (id, organization_id, tender_id, type, members, created_by, updated_at)
        VALUES (${id}::uuid, ${organizationId}::uuid, ${tenderId}::uuid, 'NOT_A_REAL_TYPE', '[]'::jsonb, ${randomUUID()}::uuid, now())`,
    ).rejects.toThrow();
    expect(await prisma.consortium.count({ where: { id } })).toBe(0);
  });

  it("Dc1Declaration round-trips and @@unique([organizationId, tenderId]) rejects a duplicate", async () => {
    const dc1 = Dc1Declaration.create({ id: randomUUID(), organizationId, tenderId, candidateType: Dc1CandidateType.Individual, signatoryName: "Jean Dupont", createdBy: randomUUID(), occurredAt: now });
    await dc1Repository.create(dc1);

    const found = await dc1Repository.findByTenderId({ organizationId, tenderId });
    expect(found?.signatoryName).toBe("Jean Dupont");
    expect(found?.candidateType).toBe("INDIVIDUAL");

    const duplicate = Dc1Declaration.create({ id: randomUUID(), organizationId, tenderId, candidateType: Dc1CandidateType.Individual, createdBy: randomUUID(), occurredAt: now });
    await expect(dc1Repository.create(duplicate)).rejects.toBeInstanceOf(DuplicateDc1DeclarationError);
  });

  it("Dc2Declaration + Dc2DeclarationVersion round-trip, versions stay immutable snapshots", async () => {
    const dc2 = Dc2Declaration.create({ id: randomUUID(), organizationId, tenderId, createdBy: randomUUID(), occurredAt: now });
    await dc2Repository.create(dc2);
    await expect(dc2Repository.create(Dc2Declaration.create({ id: randomUUID(), organizationId, tenderId, createdBy: randomUUID(), occurredAt: now }))).rejects.toBeInstanceOf(DuplicateDc2DeclarationError);

    const version = Dc2DeclarationVersion.create({ id: randomUUID(), organizationId, dc2DeclarationId: dc2.id, version: 1, data: { legalIdentity: "SIRET 123" }, createdBy: randomUUID(), occurredAt: now });
    await dc2VersionRepository.create(version);
    dc2.recordNewVersion({ versionNumber: 1, occurredAt: now });
    await dc2Repository.save(dc2);

    const versions = await dc2VersionRepository.listByDeclaration({ organizationId, dc2DeclarationId: dc2.id });
    expect(versions).toHaveLength(1);
    expect(versions[0]?.data.legalIdentity).toBe("SIRET 123");

    const updatedDeclaration = await dc2Repository.findById({ organizationId, dc2DeclarationId: dc2.id });
    expect(updatedDeclaration?.currentVersionNumber).toBe(1);
  });

  it("DumeDeclaration + DumeDeclarationVersion round-trip", async () => {
    const dume = DumeDeclaration.create({ id: randomUUID(), organizationId, tenderId, createdBy: randomUUID(), occurredAt: now });
    await dumeRepository.create(dume);
    await expect(dumeRepository.create(DumeDeclaration.create({ id: randomUUID(), organizationId, tenderId, createdBy: randomUUID(), occurredAt: now }))).rejects.toBeInstanceOf(DuplicateDumeDeclarationError);

    const version = DumeDeclarationVersion.create({ id: randomUUID(), organizationId, dumeDeclarationId: dume.id, version: 1, data: { legalIdentity: "SIRET 456" }, createdBy: randomUUID(), occurredAt: now });
    await dumeVersionRepository.create(version);

    const versions = await dumeVersionRepository.listByDeclaration({ organizationId, dumeDeclarationId: dume.id });
    expect(versions).toHaveLength(1);
    expect(versions[0]?.data.legalIdentity).toBe("SIRET 456");
  });

  it("SubcontractorDeclaration round-trips with a Decimal amount, several allowed per tender (no unique constraint)", async () => {
    const declarationA = SubcontractorDeclaration.create({ id: randomUUID(), organizationId, tenderId, subcontractorName: "A", servicesDescription: "x", amountValue: 12345.67, amountCurrency: "EUR", createdBy: randomUUID(), occurredAt: now });
    const declarationB = SubcontractorDeclaration.create({ id: randomUUID(), organizationId, tenderId, subcontractorName: "B", servicesDescription: "y", amountValue: 999.99, amountCurrency: "EUR", createdBy: randomUUID(), occurredAt: now });
    await subcontractorRepository.create(declarationA);
    await subcontractorRepository.create(declarationB);

    const list = await subcontractorRepository.listByTenderId({ organizationId, tenderId });
    expect(list).toHaveLength(2);
    const found = list.find((d) => d.id === declarationA.id);
    expect(found?.amountValue).toBe(12345.67);
  });

  it("rejects a negative SubcontractorDeclaration amount at the database level (hand-appended CHECK constraint)", async () => {
    const id = randomUUID();
    await expect(
      prisma.$executeRaw`INSERT INTO administrative_subcontractor_declarations (id, organization_id, tender_id, subcontractor_name, services_description, amount_value, amount_currency, required_documents, created_by, updated_at)
        VALUES (${id}::uuid, ${organizationId}::uuid, ${tenderId}::uuid, 'A', 'x', -1, 'EUR', '[]'::jsonb, ${randomUUID()}::uuid, now())`,
    ).rejects.toThrow();
    expect(await prisma.subcontractorDeclaration.count({ where: { id } })).toBe(0);
  });

  it("EngagementAct round-trips with a frozen pricing reference and @@unique([organizationId, tenderId]) rejects a duplicate", async () => {
    const act = EngagementAct.create({ id: randomUUID(), organizationId, tenderId, reference: "AE-2026-001", createdBy: randomUUID(), occurredAt: now });
    act.freezePricing({ pricingEstimateId: randomUUID(), pricingEstimateVersionNumber: 1, amountValue: 150000.5, amountCurrency: "EUR", frozenBy: randomUUID(), occurredAt: now });
    await engagementActRepository.create(act);

    const found = await engagementActRepository.findByTenderId({ organizationId, tenderId });
    expect(found?.frozenAmountValue).toBe(150000.5);
    expect(found?.frozenAmountCurrency).toBe("EUR");

    await expect(engagementActRepository.create(EngagementAct.create({ id: randomUUID(), organizationId, tenderId, createdBy: randomUUID(), occurredAt: now }))).rejects.toBeInstanceOf(DuplicateEngagementActError);
  });

  it("SigningPower round-trips, several allowed per tender (no unique constraint)", async () => {
    const powerA = SigningPower.create({ id: randomUUID(), organizationId, tenderId, holderName: "Jean Dupont", representedEntityDescription: "SAS Acme", scope: "Signature", createdBy: randomUUID(), occurredAt: now });
    const powerB = SigningPower.create({ id: randomUUID(), organizationId, tenderId, holderName: "Marie Martin", representedEntityDescription: "SAS Acme", scope: "Signature", createdBy: randomUUID(), occurredAt: now });
    await signingPowerRepository.create(powerA);
    await signingPowerRepository.create(powerB);

    const list = await signingPowerRepository.listByTenderId({ organizationId, tenderId });
    expect(list).toHaveLength(2);
  });

  it("tenant isolation — findById scoped by organizationId returns null across organizations", async () => {
    const consortium = Consortium.create({ id: randomUUID(), organizationId, tenderId, type: ConsortiumType.Joint, createdBy: randomUUID(), occurredAt: now });
    await consortiumRepository.create(consortium);
    expect(await consortiumRepository.findById({ organizationId: randomUUID(), consortiumId: consortium.id })).toBeNull();
  });
});
