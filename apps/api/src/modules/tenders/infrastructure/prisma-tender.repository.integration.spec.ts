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

  it("filters by status, by an explicit id set, and paginates through list()", async () => {
    const readyTender = createTender("Fourniture de mobilier de bureau");
    readyTender.changeStatus("IN_ANALYSIS", new Date());
    await repository.save(readyTender);
    await repository.save(createTender("Marche de restauration collective"));

    const idsFilterPage = await repository.list({ organizationId, limit: 10, idsFilter: [readyTender.id.value] });
    expect(idsFilterPage.items.map((item) => item.id.value)).toEqual([readyTender.id.value]);

    const emptyIdsFilterPage = await repository.list({ organizationId, limit: 10, idsFilter: [] });
    expect(emptyIdsFilterPage.items).toHaveLength(0);

    const statusPage = await repository.list({ organizationId, limit: 10, status: "IN_ANALYSIS" });
    expect(statusPage.items.every((item) => item.status === "IN_ANALYSIS")).toBe(true);

    const firstPage = await repository.list({ organizationId, limit: 1 });
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.nextCursor).not.toBeNull();
  });

  it("combines status and overdue filters with AND semantics (no clobbering)", async () => {
    const overdueDraft = createTender("Marche brouillon en retard");
    overdueDraft.updateDetails({ submissionDeadline: new Date("2020-01-01T00:00:00Z") }, new Date());
    await repository.save(overdueDraft);

    const overdueButSubmitted = createTender("Marche soumis avec echeance passee");
    overdueButSubmitted.updateDetails({ submissionDeadline: new Date("2020-01-01T00:00:00Z") }, new Date());
    overdueButSubmitted.changeStatus("IN_ANALYSIS", new Date());
    overdueButSubmitted.changeStatus("READY", new Date());
    overdueButSubmitted.changeStatus("IN_PREPARATION", new Date());
    overdueButSubmitted.changeStatus("READY_TO_SUBMIT", new Date());
    overdueButSubmitted.changeStatus("SUBMITTED", new Date());
    await repository.save(overdueButSubmitted);

    const overdueDraftsOnly = await repository.list({ organizationId, limit: 50, status: "DRAFT", overdue: true });
    expect(overdueDraftsOnly.items.map((item) => item.id.value)).toContain(overdueDraft.id.value);
    expect(overdueDraftsOnly.items.map((item) => item.id.value)).not.toContain(overdueButSubmitted.id.value);

    const overdueSubmittedOnly = await repository.list({
      organizationId,
      limit: 50,
      status: "SUBMITTED",
      overdue: true,
    });
    expect(overdueSubmittedOnly.items).toHaveLength(0);
  });

  it("sorts by updatedAt", async () => {
    const tender = createTender("Marche pour tri par derniere modification");
    await repository.save(tender);
    tender.updateDetails({ description: "mise a jour" }, new Date());
    await repository.save(tender);

    const page = await repository.list({ organizationId, limit: 50, sort: "updatedAt", sortDirection: "desc" });
    expect(page.items[0]?.id.value).toBe(tender.id.value);
  });

  it("filters by a deadline window using both deadlineAfter and deadlineBefore", async () => {
    const withinWindow = createTender("Marche avec echeance proche");
    withinWindow.updateDetails({ submissionDeadline: new Date("2026-06-05T00:00:00Z") }, new Date());
    await repository.save(withinWindow);

    const outsideWindow = createTender("Marche avec echeance lointaine");
    outsideWindow.updateDetails({ submissionDeadline: new Date("2026-12-31T00:00:00Z") }, new Date());
    await repository.save(outsideWindow);

    const page = await repository.list({
      organizationId,
      limit: 50,
      deadlineAfter: new Date("2026-06-01T00:00:00Z"),
      deadlineBefore: new Date("2026-06-10T00:00:00Z"),
    });

    expect(page.items.map((item) => item.id.value)).toContain(withinWindow.id.value);
    expect(page.items.map((item) => item.id.value)).not.toContain(outsideWindow.id.value);
  });

  it("count() matches the same filters as list(), independently of pagination", async () => {
    const scopedOrgId = randomUUID();
    await prisma.organization.create({
      data: {
        id: scopedOrgId,
        name: "Count Scope Test Org",
        slug: `count-scope-test-org-${scopedOrgId}`,
        defaultTimezone: "Europe/Paris",
        status: "TRIAL",
      },
    });

    for (let i = 0; i < 3; i += 1) {
      const id = randomUUID();
      createdTenderIds.push(id);
      await repository.save(
        Tender.create({
          id: TenderId.from(id),
          organizationId: scopedOrgId,
          title: `Marche pour count ${i}`,
          createdBy: randomUUID(),
          occurredAt: new Date(),
        }),
      );
    }

    const total = await repository.count({ organizationId: scopedOrgId });
    expect(total).toBe(3);

    const pagedList = await repository.list({ organizationId: scopedOrgId, limit: 1 });
    expect(pagedList.items).toHaveLength(1);

    const emptyIdsCount = await repository.count({ organizationId: scopedOrgId, idsFilter: [] });
    expect(emptyIdsCount).toBe(0);

    await prisma.tender.deleteMany({ where: { organizationId: scopedOrgId } });
    await prisma.organization.delete({ where: { id: scopedOrgId } });
  });

  it("countByStatus() groups by status in a single query without leaking other organizations", async () => {
    const scopedOrgId = randomUUID();
    await prisma.organization.create({
      data: {
        id: scopedOrgId,
        name: "CountByStatus Scope Test Org",
        slug: `countbystatus-scope-test-org-${scopedOrgId}`,
        defaultTimezone: "Europe/Paris",
        status: "TRIAL",
      },
    });

    const draftId = randomUUID();
    const analyzedId = randomUUID();
    createdTenderIds.push(draftId, analyzedId);
    await repository.save(
      Tender.create({
        id: TenderId.from(draftId),
        organizationId: scopedOrgId,
        title: "Marche brouillon",
        createdBy: randomUUID(),
        occurredAt: new Date(),
      }),
    );
    const analyzed = Tender.create({
      id: TenderId.from(analyzedId),
      organizationId: scopedOrgId,
      title: "Marche en analyse",
      createdBy: randomUUID(),
      occurredAt: new Date(),
    });
    analyzed.changeStatus("IN_ANALYSIS", new Date());
    await repository.save(analyzed);

    const byStatus = await repository.countByStatus(scopedOrgId);
    expect(byStatus).toEqual({ DRAFT: 1, IN_ANALYSIS: 1 });

    await prisma.tender.deleteMany({ where: { organizationId: scopedOrgId } });
    await prisma.organization.delete({ where: { id: scopedOrgId } });
  });
});
