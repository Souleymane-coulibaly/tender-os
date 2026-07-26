import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { PrismaPlatformAuditLog } from "./prisma-platform-audit-log";

describe("PrismaPlatformAuditLog (PostgreSQL)", () => {
  const prisma = new PrismaService();
  const auditLog = new PrismaPlatformAuditLog(prisma);
  const organizationId = randomUUID();
  const createdLogIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.create({
      data: {
        id: organizationId,
        name: "Integration Test Org",
        slug: `integration-audit-org-${organizationId}`,
        defaultTimezone: "Europe/Paris",
        status: "ACTIVE",
      },
    });
  });

  afterAll(async () => {
    if (createdLogIds.length > 0) {
      await prisma.auditLog.deleteMany({ where: { id: { in: createdLogIds } } });
    }
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  it("records an entry with actorType PLATFORM_ADMIN and lists it back", async () => {
    const actorId = randomUUID();

    await auditLog.record({
      organizationId,
      actorId,
      action: "platform.organization.suspended",
      resourceId: organizationId,
      metadata: { reason: "Integration test" },
    });

    const record = await prisma.auditLog.findFirst({
      where: { organizationId, actorId, action: "platform.organization.suspended" },
    });
    expect(record?.actorType).toBe("PLATFORM_ADMIN");
    if (record) {
      createdLogIds.push(record.id);
    }

    const page = await auditLog.list({ limit: 100 });
    expect(page.items.some((item) => item.actorId === actorId)).toBe(true);
  });
});
