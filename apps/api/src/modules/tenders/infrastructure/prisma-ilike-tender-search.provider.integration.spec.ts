import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { TenderId } from "../domain/tender-id.value-object";
import { Tender } from "../domain/tender.aggregate";
import { PrismaIlikeTenderSearchProvider } from "./prisma-ilike-tender-search.provider";
import { PrismaTenderRepository } from "./prisma-tender.repository";

describe("PrismaIlikeTenderSearchProvider (PostgreSQL)", () => {
  const prisma = new PrismaService();
  const tenderRepository = new PrismaTenderRepository(prisma);
  const searchProvider = new PrismaIlikeTenderSearchProvider(prisma);
  const organizationId = randomUUID();
  const createdTenderIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.create({
      data: {
        id: organizationId,
        name: "Tender Search Integration Test Org",
        slug: `tender-search-integration-test-org-${organizationId}`,
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

  async function createTender(title: string, reference?: string): Promise<Tender> {
    const id = randomUUID();
    createdTenderIds.push(id);
    const tender = Tender.create({
      id: TenderId.from(id),
      organizationId,
      title,
      reference,
      createdBy: randomUUID(),
      occurredAt: new Date(),
    });
    await tenderRepository.save(tender);
    return tender;
  }

  it("matches on title, case-insensitively", async () => {
    const tender = await createTender("Fourniture de mobilier de bureau");

    const ids = await searchProvider.findMatchingTenderIds({ organizationId, query: "MOBILIER" });

    expect(ids).toContain(tender.id.value);
  });

  it("matches on reference", async () => {
    const tender = await createTender("Marche de nettoyage", "AO-2026-999");

    const ids = await searchProvider.findMatchingTenderIds({ organizationId, query: "AO-2026-999" });

    expect(ids).toContain(tender.id.value);
  });

  it("never returns ids from another organization", async () => {
    await createTender("Marche de nettoyage exclusif");

    const ids = await searchProvider.findMatchingTenderIds({ organizationId: randomUUID(), query: "nettoyage" });

    expect(ids).toHaveLength(0);
  });

  it("returns an empty array when nothing matches", async () => {
    const ids = await searchProvider.findMatchingTenderIds({ organizationId, query: "aucune-correspondance-xyz" });

    expect(ids).toHaveLength(0);
  });
});
