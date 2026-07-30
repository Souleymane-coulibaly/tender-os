import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { DuplicateTenderLotNumberError } from "../domain/errors";
import { TenderLot } from "../domain/tender-lot.entity";
import { PrismaTenderLotRepository } from "./prisma-tender-lot.repository";

describe("PrismaTenderLotRepository (PostgreSQL)", () => {
  const prisma = new PrismaService();
  const repository = new PrismaTenderLotRepository(prisma);
  const organizationId = randomUUID();
  const tenderId = randomUUID();
  const otherOrganizationId = randomUUID();
  const otherTenderId = randomUUID();
  const createdLotIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.create({
      data: {
        id: otherOrganizationId,
        name: "Tender Lot Integration Test Org (other)",
        slug: `tender-lot-integration-test-org-other-${otherOrganizationId}`,
        defaultTimezone: "Europe/Paris",
        status: "TRIAL",
      },
    });
    const otherClientAccount = await prisma.clientAccount.create({
      data: {
        id: randomUUID(),
        organizationId: otherOrganizationId,
        name: "Client de test (other)",
        nameNormalized: "client de test (other)",
        status: "ACTIVE",
        createdBy: randomUUID(),
      },
    });
    await prisma.tender.create({
      data: {
        id: otherTenderId,
        organizationId: otherOrganizationId,
        clientAccountId: otherClientAccount.id,
        title: "Autre marche, autre organisation",
        status: "DRAFT",
        tags: [],
        createdBy: randomUUID(),
      },
    });
    await prisma.organization.create({
      data: {
        id: organizationId,
        name: "Tender Lot Integration Test Org",
        slug: `tender-lot-integration-test-org-${organizationId}`,
        defaultTimezone: "Europe/Paris",
        status: "TRIAL",
      },
    });
    const clientAccount = await prisma.clientAccount.create({
      data: {
        id: randomUUID(),
        organizationId,
        name: "Client de test",
        nameNormalized: "client de test",
        status: "ACTIVE",
        createdBy: randomUUID(),
      },
    });
    await prisma.tender.create({
      data: {
        id: tenderId,
        organizationId,
        clientAccountId: clientAccount.id,
        title: "Marche pour tests de lots",
        status: "DRAFT",
        tags: [],
        createdBy: randomUUID(),
      },
    });
  });

  afterAll(async () => {
    if (createdLotIds.length > 0) {
      await prisma.tenderLot.deleteMany({ where: { id: { in: createdLotIds } } });
    }
    await prisma.tender.delete({ where: { id: tenderId } });
    await prisma.clientAccount.deleteMany({ where: { organizationId } });
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.tender.delete({ where: { id: otherTenderId } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: otherOrganizationId } });
    await prisma.organization.delete({ where: { id: otherOrganizationId } });
    await prisma.$disconnect();
  });

  function createLot(lotNumber: string, displayOrder: number): TenderLot {
    const id = randomUUID();
    createdLotIds.push(id);
    return TenderLot.create({
      id,
      organizationId,
      tenderId,
      lotNumber,
      title: `Lot ${lotNumber}`,
      displayOrder,
      occurredAt: new Date(),
    });
  }

  it("persists a lot and reads it back scoped to the tender", async () => {
    const lot = createLot("L01", 0);
    await repository.save(lot);

    const found = await repository.findById({ organizationId, tenderId, lotId: lot.id });
    expect(found?.lotNumber).toBe("L01");
    expect(found?.displayOrder).toBe(0);
  });

  it("rejects at the database level a tender_lot row whose (tenderId, organizationId) pair does not match a real Tender (AUDIT-007)", async () => {
    // Contournement volontaire du repository/domaine pour prouver que la contrainte vit bien en
    // base — un organizationId incohérent avec le Tender référencé (otherTenderId appartient à
    // otherOrganizationId, jamais à organizationId) doit être rejeté par Postgres lui-même, pas
    // seulement par la vérification applicative des cas d'usage.
    await expect(
      prisma.tenderLot.create({
        data: {
          id: randomUUID(),
          organizationId, // org A
          tenderId: otherTenderId, // appartient à org B — couple incohérent
          lotNumber: "MISMATCH",
          title: "Lot avec organizationId incoherent",
          displayOrder: 0,
        },
      }),
    ).rejects.toThrow();
  });

  it("excludes a soft-deleted lot from findById/listByTender but includes it via findByIdIncludingDeleted", async () => {
    const lot = createLot("L02", 1);
    await repository.save(lot);

    lot.softDelete(new Date());
    await repository.save(lot);

    const found = await repository.findById({ organizationId, tenderId, lotId: lot.id });
    expect(found).toBeNull();

    const includingDeleted = await repository.findByIdIncludingDeleted({ organizationId, tenderId, lotId: lot.id });
    expect(includingDeleted?.deletedAt).toBeInstanceOf(Date);

    const listed = await repository.listByTender({ organizationId, tenderId });
    expect(listed.some((item) => item.id === lot.id)).toBe(false);
  });

  it("createAppendedAtEnd ignores the provisional displayOrder and appends at the real end of the active list (AUDIT-002)", async () => {
    const before = await repository.listByTender({ organizationId, tenderId });

    const lot = createLot("L03", 0); // displayOrder provisoire, doit être écrasé
    const created = await repository.createAppendedAtEnd(lot);

    expect(created.displayOrder).toBe(before.length);
  });

  it("restoreAppendedAtEnd clears deletedAt and repositions the lot at the end of the active list (AUDIT-002)", async () => {
    const lot = createLot("L04", 0);
    await repository.save(lot);
    lot.softDelete(new Date());
    await repository.save(lot);

    const before = await repository.listByTender({ organizationId, tenderId });
    const restored = await repository.restoreAppendedAtEnd({ lot, occurredAt: new Date() });

    expect(restored.deletedAt).toBeUndefined();
    expect(restored.displayOrder).toBe(before.length);
  });

  it("never produces a duplicate displayOrder under a real concurrent race of createAppendedAtEnd (AUDIT-002)", async () => {
    const concurrentLotNumbers = ["C01", "C02", "C03", "C04", "C05"];
    const before = await repository.listByTender({ organizationId, tenderId });

    const created = await Promise.all(
      concurrentLotNumbers.map((lotNumber) => repository.createAppendedAtEnd(createLot(lotNumber, 0))),
    );

    const displayOrders = created.map((lot) => lot.displayOrder).sort((a, b) => a - b);
    const expected = concurrentLotNumbers.map((_, index) => before.length + index);
    expect(displayOrders).toEqual(expected);
  });

  it("lists active lots ordered by displayOrder", async () => {
    const lotA = createLot("L10", 100);
    const lotB = createLot("L11", 99);
    await repository.save(lotA);
    await repository.save(lotB);

    const listed = await repository.listByTender({ organizationId, tenderId });
    const indexA = listed.findIndex((item) => item.id === lotA.id);
    const indexB = listed.findIndex((item) => item.id === lotB.id);
    expect(indexB).toBeLessThan(indexA);
  });

  it("throws DuplicateTenderLotNumberError when the unique constraint is violated, even against a soft-deleted lot", async () => {
    const lot = createLot("L20", 0);
    await repository.save(lot);
    lot.softDelete(new Date());
    await repository.save(lot);

    const conflicting = createLot("L20", 1);
    await expect(repository.save(conflicting)).rejects.toThrow(DuplicateTenderLotNumberError);
  });

  it("throws DuplicateTenderLotNumberError under a real concurrent race for the same lot number", async () => {
    const lotA = createLot("L30", 0);
    const lotB = createLot("L30", 1);

    const results = await Promise.allSettled([repository.save(lotA), repository.save(lotB)]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(DuplicateTenderLotNumberError);
  });

  it("saveReordered atomically reassigns displayOrder for several lots", async () => {
    const lotA = createLot("L40", 0);
    const lotB = createLot("L41", 1);
    await repository.save(lotA);
    await repository.save(lotB);

    lotA.reorder(1, new Date());
    lotB.reorder(0, new Date());
    await repository.saveReordered([lotB, lotA]);

    const found = await repository.listByTender({ organizationId, tenderId });
    const foundA = found.find((item) => item.id === lotA.id);
    const foundB = found.find((item) => item.id === lotB.id);
    expect(foundB?.displayOrder).toBe(0);
    expect(foundA?.displayOrder).toBe(1);
  });
});
