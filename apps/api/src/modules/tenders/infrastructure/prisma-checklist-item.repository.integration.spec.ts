import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { ChecklistItem } from "../domain/checklist-item.entity";
import { PrismaChecklistItemRepository } from "./prisma-checklist-item.repository";

describe("PrismaChecklistItemRepository (PostgreSQL)", () => {
  const prisma = new PrismaService();
  const repository = new PrismaChecklistItemRepository(prisma);
  const organizationId = randomUUID();
  const tenderId = randomUUID();
  const createdItemIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.create({
      data: {
        id: organizationId,
        name: "Checklist Integration Test Org",
        slug: `checklist-integration-test-org-${organizationId}`,
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
        title: "Marche pour tests checklist",
        status: "DRAFT",
        tags: [],
        createdBy: randomUUID(),
      },
    });
  });

  afterAll(async () => {
    if (createdItemIds.length > 0) {
      await prisma.tenderChecklistItem.deleteMany({ where: { id: { in: createdItemIds } } });
    }
    await prisma.tender.delete({ where: { id: tenderId } });
    await prisma.clientAccount.deleteMany({ where: { organizationId } });
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  function createItem(title: string): ChecklistItem {
    const id = randomUUID();
    createdItemIds.push(id);

    return ChecklistItem.create({
      id,
      organizationId,
      tenderId,
      title,
      required: true,
      occurredAt: new Date(),
    });
  }

  it("persists a checklist item and reads it back scoped to the tender", async () => {
    const item = createItem("Fournir attestation assurance");
    await repository.save(item);

    const found = await repository.findById({ organizationId, tenderId, itemId: item.id });
    expect(found?.title).toBe("Fournir attestation assurance");
    expect(found?.status).toBe("TODO");
  });

  it("stamps completedAt/completedBy on completion and clears them when reopened", async () => {
    const item = createItem("Fournir RIB");
    await repository.save(item);

    const actorId = randomUUID();
    item.changeStatus("COMPLETED", actorId, new Date());
    await repository.save(item);

    const completed = await repository.findById({ organizationId, tenderId, itemId: item.id });
    expect(completed?.status).toBe("COMPLETED");
    expect(completed?.completedBy).toBe(actorId);
    expect(completed?.completedAt).toBeInstanceOf(Date);

    completed!.changeStatus("IN_PROGRESS", actorId, new Date());
    await repository.save(completed!);

    const reopened = await repository.findById({ organizationId, tenderId, itemId: item.id });
    expect(reopened?.completedAt).toBeUndefined();
    expect(reopened?.completedBy).toBeUndefined();
  });

  it("lists checklist items ordered by displayOrder", async () => {
    const second = ChecklistItem.create({
      id: randomUUID(),
      organizationId,
      tenderId,
      title: "Deuxieme piece",
      displayOrder: 2,
      occurredAt: new Date(),
    });
    const first = ChecklistItem.create({
      id: randomUUID(),
      organizationId,
      tenderId,
      title: "Premiere piece",
      displayOrder: 1,
      occurredAt: new Date(),
    });
    createdItemIds.push(second.id, first.id);
    await repository.save(second);
    await repository.save(first);

    const items = await repository.listByTender({ organizationId, tenderId });
    const orders = items.map((item) => item.displayOrder);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });
});
