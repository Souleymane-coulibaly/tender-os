import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { TenderConcurrentModificationError } from "../domain/errors";
import { TenderId } from "../domain/tender-id.value-object";
import { Tender } from "../domain/tender.aggregate";
import { PrismaTenderRepository } from "./prisma-tender.repository";

describe("PrismaTenderRepository (PostgreSQL)", () => {
  const prisma = new PrismaService();
  const repository = new PrismaTenderRepository(prisma);
  const organizationId = randomUUID();
  const createdTenderIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.create({
      data: {
        id: organizationId,
        name: "Tenders Integration Test Org",
        slug: `tenders-integration-test-org-${organizationId}`,
        defaultTimezone: "Europe/Paris",
        status: "TRIAL",
      },
    });
  });

  afterAll(async () => {
    if (createdTenderIds.length > 0) {
      await prisma.tender.deleteMany({ where: { id: { in: createdTenderIds } } });
    }
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  function createTender(title: string): Tender {
    const id = randomUUID();
    createdTenderIds.push(id);

    return Tender.create({
      id: TenderId.from(id),
      organizationId,
      title,
      createdBy: randomUUID(),
      occurredAt: new Date(),
    });
  }

  it("persists a new tender and reads it back by id", async () => {
    const tender = createTender("Marche de nettoyage");

    await repository.save(tender);
    const found = await repository.findById({ organizationId, tenderId: tender.id.value });

    expect(found).not.toBeNull();
    expect(found?.title).toBe("Marche de nettoyage");
    expect(found?.status).toBe("DRAFT");
    expect(found?.version).toBe(1);
  });

  it("returns null when the tender belongs to a different organization", async () => {
    const tender = createTender("Marche isole");
    await repository.save(tender);

    const found = await repository.findById({ organizationId: randomUUID(), tenderId: tender.id.value });

    expect(found).toBeNull();
  });

  it("persists an update and increments the version", async () => {
    const tender = createTender("Marche a mettre a jour");
    await repository.save(tender);

    tender.updateDetails({ description: "Nettoyage courant" }, new Date());
    await repository.save(tender);

    const found = await repository.findById({ organizationId, tenderId: tender.id.value });
    expect(found?.description).toBe("Nettoyage courant");
    expect(found?.version).toBe(2);
  });

  it("throws TenderConcurrentModificationError when saving a stale version", async () => {
    const tender = createTender("Marche concurrent");
    await repository.save(tender);

    const staleCopy = (await repository.findById({ organizationId, tenderId: tender.id.value }))!;

    tender.updateDetails({ description: "Premiere modification" }, new Date());
    await repository.save(tender);

    staleCopy.updateDetails({ description: "Modification concurrente" }, new Date());
    await expect(repository.save(staleCopy)).rejects.toThrow(TenderConcurrentModificationError);
  });

  it("filters, searches, and paginates through list()", async () => {
    const readyTender = createTender("Fourniture de mobilier de bureau");
    readyTender.changeStatus("IN_ANALYSIS", new Date());
    await repository.save(readyTender);
    await repository.save(createTender("Marche de restauration collective"));

    const searchPage = await repository.list({ organizationId, limit: 10, search: "mobilier" });
    expect(searchPage.items.some((item) => item.id.value === readyTender.id.value)).toBe(true);

    const statusPage = await repository.list({ organizationId, limit: 10, status: "IN_ANALYSIS" });
    expect(statusPage.items.every((item) => item.status === "IN_ANALYSIS")).toBe(true);

    const firstPage = await repository.list({ organizationId, limit: 1 });
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.nextCursor).not.toBeNull();
  });
});
