import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { DceAlreadyExistsError } from "../domain/errors";
import { Dce } from "../domain/dce.aggregate";
import { DceId } from "../domain/dce-id.value-object";
import { DceStatus } from "../domain/dce-status";
import { PrismaDceRepository } from "./prisma-dce.repository";

describe("PrismaDceRepository (PostgreSQL)", () => {
  const prisma = new PrismaService();
  const repository = new PrismaDceRepository(prisma);
  const organizationId = randomUUID();
  const otherOrganizationId = randomUUID();
  const otherTenderId = randomUUID();
  const actorId = randomUUID();
  const createdDceIds: string[] = [];
  const createdTenderIds: string[] = [];
  let clientAccountId: string;
  let otherClientAccountId: string;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.create({
      data: {
        id: otherOrganizationId,
        name: "DCE Repository Integration Test Org (other)",
        slug: `dce-repo-integration-test-org-other-${otherOrganizationId}`,
        defaultTimezone: "Europe/Paris",
        status: "TRIAL",
      },
    });
    otherClientAccountId = (
      await prisma.clientAccount.create({
        data: {
          id: randomUUID(),
          organizationId: otherOrganizationId,
          name: "Client de test (other)",
          nameNormalized: "client de test (other)",
          status: "ACTIVE",
          createdBy: actorId,
        },
      })
    ).id;
    await prisma.tender.create({
      data: {
        id: otherTenderId,
        organizationId: otherOrganizationId,
        clientAccountId: otherClientAccountId,
        title: "Autre marche, autre organisation",
        status: "DRAFT",
        tags: [],
        createdBy: actorId,
      },
    });
    await prisma.organization.create({
      data: {
        id: organizationId,
        name: "DCE Repository Integration Test Org",
        slug: `dce-repo-integration-test-org-${organizationId}`,
        defaultTimezone: "Europe/Paris",
        status: "TRIAL",
      },
    });
    clientAccountId = (
      await prisma.clientAccount.create({
        data: {
          id: randomUUID(),
          organizationId,
          name: "Client de test",
          nameNormalized: "client de test",
          status: "ACTIVE",
          createdBy: actorId,
        },
      })
    ).id;
  });

  afterAll(async () => {
    if (createdDceIds.length > 0) {
      await prisma.dce.deleteMany({ where: { id: { in: createdDceIds } } });
    }
    if (createdTenderIds.length > 0) {
      await prisma.tender.deleteMany({ where: { id: { in: createdTenderIds } } });
    }
    await prisma.clientAccount.deleteMany({ where: { organizationId } });
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.tender.delete({ where: { id: otherTenderId } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: otherOrganizationId } });
    await prisma.organization.delete({ where: { id: otherOrganizationId } });
    await prisma.$disconnect();
  });

  /** Un Tender ne porte jamais plus d'un DCE (contrainte réelle) : chaque test qui doit créer un
   *  nouveau DCE avec succès a besoin de son propre Tender, sous peine de collision avec les
   *  DCE déjà créés par les tests précédents dans la même organisation. */
  async function createTender(): Promise<string> {
    const id = randomUUID();
    createdTenderIds.push(id);
    await prisma.tender.create({
      data: { id, organizationId, clientAccountId, title: "Marche pour tests DCE", status: "DRAFT", tags: [], createdBy: actorId },
    });
    return id;
  }

  function buildDce(tenderId: string): Dce {
    const id = randomUUID();
    createdDceIds.push(id);
    return Dce.create({
      id: DceId.from(id),
      organizationId,
      tenderId,
      createdByUserId: actorId,
      occurredAt: new Date(),
    });
  }

  it("persists a DCE and reads it back by id and by tenderId, scoped to the organization", async () => {
    const tenderId = await createTender();
    const dce = buildDce(tenderId);
    await repository.create(dce);

    const byId = await repository.findById({ organizationId, dceId: dce.id.value });
    expect(byId?.status).toBe(DceStatus.Draft);

    const byTenderId = await repository.findByTenderId({ organizationId, tenderId });
    expect(byTenderId?.id.value).toBe(dce.id.value);
  });

  it("does not find a DCE scoped to a different organization even with the correct id", async () => {
    const tenderId = await createTender();
    const dce = buildDce(tenderId);
    await repository.create(dce);

    const found = await repository.findById({ organizationId: otherOrganizationId, dceId: dce.id.value });
    expect(found).toBeNull();
  });

  it("throws DceAlreadyExistsError when a second DCE is created for a tender that already has one", async () => {
    const tenderId = await createTender();
    const first = buildDce(tenderId);
    await repository.create(first);

    const second = Dce.create({
      id: DceId.from(randomUUID()),
      organizationId,
      tenderId, // même tender que `first`
      createdByUserId: actorId,
      occurredAt: new Date(),
    });
    createdDceIds.push(second.id.value);

    await expect(repository.create(second)).rejects.toThrow(DceAlreadyExistsError);
  });

  it("persists a status transition via save", async () => {
    const tenderId = await createTender();
    const dce = buildDce(tenderId);
    await repository.create(dce);

    dce.markImported(new Date());
    await repository.save(dce);

    const found = await repository.findById({ organizationId, dceId: dce.id.value });
    expect(found?.status).toBe(DceStatus.Imported);
  });

  it("TEST 1 (Checkpoint 2.1-P2.1-FIX-A) — a freshly persisted DCE starts at revision 1, a meaningful baseline", async () => {
    const tenderId = await createTender();
    const dce = buildDce(tenderId);
    await repository.create(dce);

    const found = await repository.findById({ organizationId, dceId: dce.id.value });
    expect(found?.revision).toBe(1);
  });

  it("TEST 7 (Checkpoint 2.1-P2.1-FIX-A, concurrency) — N concurrent incrementRevision calls on the SAME DCE never lose a single increment (atomic UPDATE ... SET revision = revision + 1)", async () => {
    const tenderId = await createTender();
    const dce = buildDce(tenderId);
    await repository.create(dce);

    const concurrentIncrements = 10;
    await Promise.all(
      Array.from({ length: concurrentIncrements }, () => repository.incrementRevision({ organizationId, dceId: dce.id.value })),
    );

    const found = await repository.findById({ organizationId, dceId: dce.id.value });
    expect(found?.revision).toBe(1 + concurrentIncrements);
  });

  it("TEST 9 (Checkpoint 2.1-P2.1-FIX-A, tenant isolation) — incrementRevision scoped to a different organizationId never advances another organization's DCE", async () => {
    const tenderId = await createTender();
    const dce = buildDce(tenderId);
    await repository.create(dce);

    await expect(repository.incrementRevision({ organizationId: otherOrganizationId, dceId: dce.id.value })).rejects.toThrow();

    const found = await repository.findById({ organizationId, dceId: dce.id.value });
    expect(found?.revision).toBe(1);
  });

  it("save() (a status transition) never resets a revision already advanced by incrementRevision — the two are independent column-scoped writes", async () => {
    const tenderId = await createTender();
    const dce = buildDce(tenderId);
    await repository.create(dce);

    await repository.incrementRevision({ organizationId, dceId: dce.id.value });
    await repository.incrementRevision({ organizationId, dceId: dce.id.value });

    dce.markImported(new Date());
    await repository.save(dce);

    const found = await repository.findById({ organizationId, dceId: dce.id.value });
    expect(found?.status).toBe(DceStatus.Imported);
    expect(found?.revision).toBe(3);
  });

  it("rejects at the database level a dce row whose (tenderId, organizationId) pair does not match a real Tender", async () => {
    // Contournement volontaire du repository/domaine — un organizationId incohérent avec le
    // Tender référencé (otherTenderId appartient à otherOrganizationId) doit être rejeté par
    // Postgres lui-même (contrainte réelle exigée par la mission Sprint 0), pas seulement par
    // la vérification applicative des cas d'usage.
    await expect(
      prisma.dce.create({
        data: {
          id: randomUUID(),
          organizationId, // org A
          tenderId: otherTenderId, // appartient à org B — couple incohérent
          status: "DRAFT",
          createdByUserId: actorId,
        },
      }),
    ).rejects.toThrow();
  });
});
