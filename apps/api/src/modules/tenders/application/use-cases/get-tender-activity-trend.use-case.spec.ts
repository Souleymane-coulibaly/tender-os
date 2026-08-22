import { beforeEach, describe, expect, it } from "vitest";
import { TenderId } from "../../domain/tender-id.value-object";
import { Tender } from "../../domain/tender.aggregate";
import { createClientPortfolioTestFixture, DEFAULT_TEST_CLIENT_ACCOUNT_ID, InMemoryTenderRepository } from "../../test-support/fakes";
import { GetTenderActivityTrendUseCase } from "./get-tender-activity-trend.use-case";

const NOW = new Date("2026-06-15T12:00:00.000Z");

function seedTenderCreatedAt(repository: InMemoryTenderRepository, id: string, createdAt: Date, clientAccountId = DEFAULT_TEST_CLIENT_ACCOUNT_ID): Promise<void> {
  const tender = Tender.create({
    id: TenderId.from(id),
    organizationId: "org-1",
    clientAccountId,
    title: `Marché ${id}`,
    createdBy: "user-1",
    occurredAt: createdAt,
  });
  return repository.seed(tender);
}

describe("GetTenderActivityTrendUseCase — Checkpoint TENDEROS-2.1-P2.3-E5 (Dashboard V2 Premium Analytics)", () => {
  let tenderRepository: InMemoryTenderRepository;
  let useCase: GetTenderActivityTrendUseCase;

  beforeEach(async () => {
    tenderRepository = new InMemoryTenderRepository();
    const clientPortfolio = await createClientPortfolioTestFixture("org-1");
    useCase = new GetTenderActivityTrendUseCase(tenderRepository, clientPortfolio.listAccessibleClientsUseCase);
  });

  it("BLOQUANT — always returns exactly periodDays points, one per day, even with zero activity (never a silently missing day)", async () => {
    const points = await useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "READ_ONLY", periodDays: 7, timezone: "UTC", now: NOW });

    expect(points).toHaveLength(7);
    expect(points.every((point) => point.count === 0)).toBe(true);
    // Chronologique, le dernier point est "aujourd'hui" (mission §4/§31 — jamais un ordre ambigu).
    expect(points[6]!.date).toBe("2026-06-15");
    expect(points[0]!.date).toBe("2026-06-09");
  });

  it("counts a tender exactly once on its real creation day, and never before `since`", async () => {
    await seedTenderCreatedAt(tenderRepository, "in-window", new Date("2026-06-14T10:00:00.000Z"));
    await seedTenderCreatedAt(tenderRepository, "out-of-window", new Date("2026-05-01T10:00:00.000Z"));

    const points = await useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "READ_ONLY", periodDays: 7, timezone: "UTC", now: NOW });

    const total = points.reduce((sum, point) => sum + point.count, 0);
    expect(total).toBe(1);
    expect(points.find((p) => p.date === "2026-06-14")?.count).toBe(1);
  });

  it("BLOQUANT — mission §32: buckets by the ORGANIZATION's real timezone, never UTC/Europe-Paris assumed — the same instant can land on a different calendar day depending on the timezone passed in", async () => {
    // 23:30 UTC le 14 juin -> encore le 14 juin en UTC, mais déjà le 15 juin dans un fuseau UTC+14.
    await seedTenderCreatedAt(tenderRepository, "late-utc", new Date("2026-06-14T23:30:00.000Z"));

    const utcPoints = await useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "READ_ONLY", periodDays: 7, timezone: "UTC", now: NOW });
    expect(utcPoints.find((p) => p.date === "2026-06-14")?.count).toBe(1);
    expect(utcPoints.find((p) => p.date === "2026-06-15")?.count).toBe(0);

    const kiritimatiPoints = await useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "READ_ONLY", periodDays: 7, timezone: "Pacific/Kiritimati", now: NOW });
    expect(kiritimatiPoints.find((p) => p.date === "2026-06-15")?.count).toBe(1);
    expect(kiritimatiPoints.find((p) => p.date === "2026-06-14")?.count).toBe(0);
  });

  it("BLOQUANT — tenant isolation: never counts another organization's tenders", async () => {
    await seedTenderCreatedAt(tenderRepository, "org-1-tender", new Date("2026-06-14T10:00:00.000Z"));
    const orgBTender = Tender.create({ id: TenderId.from("org-2-tender"), organizationId: "org-2", clientAccountId: "client-org-2", title: "Autre org", createdBy: "user-x", occurredAt: new Date("2026-06-14T10:00:00.000Z") });
    await tenderRepository.seed(orgBTender);

    const points = await useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "READ_ONLY", periodDays: 7, timezone: "UTC", now: NOW });

    expect(points.reduce((sum, p) => sum + p.count, 0)).toBe(1);
  });

  it("respects an explicit clientAccountId filter (same ClientAccess discipline as GetTenderStatisticsUseCase)", async () => {
    await seedTenderCreatedAt(tenderRepository, "client-a", new Date("2026-06-14T10:00:00.000Z"), DEFAULT_TEST_CLIENT_ACCOUNT_ID);
    await seedTenderCreatedAt(tenderRepository, "client-b", new Date("2026-06-14T10:00:00.000Z"), "some-other-client");

    const points = await useCase.execute({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: "READ_ONLY",
      clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID,
      periodDays: 7,
      timezone: "UTC",
      now: NOW,
    });

    expect(points.reduce((sum, p) => sum + p.count, 0)).toBe(1);
  });
});
