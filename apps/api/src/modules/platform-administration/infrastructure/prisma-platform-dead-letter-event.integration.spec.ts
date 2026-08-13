import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { PrismaPlatformDeadLetterEvents } from "./prisma-platform-dead-letter-event";

describe("PrismaPlatformDeadLetterEvents (PostgreSQL)", () => {
  const prisma = new PrismaService();
  const reader = new PrismaPlatformDeadLetterEvents(prisma);
  const organizationId = randomUUID();
  const otherOrganizationId = randomUUID();
  const createdIds: string[] = [];

  async function createDeadLetterEvent(input: { organizationId: string }): Promise<string> {
    const record = await prisma.deadLetterEvent.create({
      data: {
        id: randomUUID(),
        organizationId: input.organizationId,
        outboxEventId: randomUUID(),
        eventType: "TenderCreated",
        aggregateType: "Tender",
        aggregateId: randomUUID(),
        payload: { title: "should never appear in the platform-admin list view" },
        failureReason: "webhook endpoint returned HTTP 500 five times",
        attemptCount: 5,
      },
    });
    createdIds.push(record.id);
    return record.id;
  }

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.create({
      data: { id: organizationId, name: "DLQ Test Org", slug: `dlq-test-org-${organizationId}`, defaultTimezone: "Europe/Paris", status: "ACTIVE" },
    });
    await prisma.organization.create({
      data: { id: otherOrganizationId, name: "DLQ Other Org", slug: `dlq-other-org-${otherOrganizationId}`, defaultTimezone: "Europe/Paris", status: "ACTIVE" },
    });
  });

  afterAll(async () => {
    if (createdIds.length > 0) {
      await prisma.deadLetterEvent.deleteMany({ where: { id: { in: createdIds } } });
    }
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.organization.delete({ where: { id: otherOrganizationId } });
    await prisma.$disconnect();
  });

  it("lists dead-letter events across organizations, never exposing the raw payload", async () => {
    const id = await createDeadLetterEvent({ organizationId });

    const page = await reader.list({ limit: 100 });
    const item = page.items.find((entry) => entry.id === id);

    expect(item).toEqual({
      id,
      organizationId,
      outboxEventId: expect.any(String),
      eventType: "TenderCreated",
      aggregateType: "Tender",
      aggregateId: expect.any(String),
      failureReason: "webhook endpoint returned HTTP 500 five times",
      attemptCount: 5,
      movedAt: expect.any(String),
    });
    expect(item).not.toHaveProperty("payload");
  });

  it("filters by organizationId when provided", async () => {
    const idInOrg = await createDeadLetterEvent({ organizationId });
    const idInOtherOrg = await createDeadLetterEvent({ organizationId: otherOrganizationId });

    const page = await reader.list({ limit: 100, organizationId });

    expect(page.items.some((item) => item.id === idInOrg)).toBe(true);
    expect(page.items.some((item) => item.id === idInOtherOrg)).toBe(false);
  });

  it("paginates with a cursor, never returning the same row twice", async () => {
    const ids = await Promise.all([
      createDeadLetterEvent({ organizationId }),
      createDeadLetterEvent({ organizationId }),
      createDeadLetterEvent({ organizationId }),
    ]);

    const firstPage = await reader.list({ limit: 2, organizationId });
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = await reader.list({ limit: 2, organizationId, cursor: firstPage.nextCursor ?? undefined });
    const firstPageIds = firstPage.items.map((item) => item.id);
    const secondPageIds = secondPage.items.map((item) => item.id);

    expect(firstPageIds.some((id) => secondPageIds.includes(id))).toBe(false);
    for (const id of ids) {
      expect([...firstPageIds, ...secondPageIds]).toContain(id);
    }
  });
});
