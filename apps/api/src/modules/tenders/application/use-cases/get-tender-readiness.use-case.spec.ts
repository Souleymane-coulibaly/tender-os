import { beforeEach, describe, expect, it } from "vitest";
import { TenderNotFoundError } from "../../domain/errors";
import { Risk } from "../../domain/risk.entity";
import { TenderId } from "../../domain/tender-id.value-object";
import { Tender } from "../../domain/tender.aggregate";
import {
  FixedClock,
  InMemoryAlertRepository,
  InMemoryAwardCriterionRepository,
  InMemoryChecklistItemRepository,
  InMemoryMilestoneRepository,
  InMemoryRiskRepository,
  InMemoryTenderRepository,
} from "../../test-support/fakes";
import { GetTenderReadinessUseCase } from "./get-tender-readiness.use-case";

describe("GetTenderReadinessUseCase", () => {
  let tenderRepository: InMemoryTenderRepository;
  let riskRepository: InMemoryRiskRepository;
  let useCase: GetTenderReadinessUseCase;

  beforeEach(async () => {
    tenderRepository = new InMemoryTenderRepository();
    riskRepository = new InMemoryRiskRepository();
    useCase = new GetTenderReadinessUseCase(
      tenderRepository,
      new InMemoryChecklistItemRepository(),
      new InMemoryAwardCriterionRepository(),
      new InMemoryMilestoneRepository(),
      riskRepository,
      new InMemoryAlertRepository(),
      new FixedClock(),
    );

    await tenderRepository.seed(
      Tender.create({
        id: TenderId.from("tender-1"),
        organizationId: "org-1",
        clientAccountId: "client-1",
        title: "Marche de nettoyage",
        createdBy: "user-1",
        occurredAt: new Date("2026-01-01T00:00:00Z"),
      }),
    );
  });

  it("composes the sub-resources into a deterministic readiness score", async () => {
    const result = await useCase.execute({ organizationId: "org-1", tenderId: "tender-1", actorRole: "READ_ONLY", actorId: "actor-1" });

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.criticalAlerts).toBe(0);
    expect(result.status).not.toBe("NOT_READY");
  });

  it("forces NOT_READY when an unresolved critical risk exists, regardless of the numeric score", async () => {
    await riskRepository.seed(
      Risk.create({
        id: "risk-1",
        organizationId: "org-1",
        tenderId: "tender-1",
        title: "Delai tres court",
        severity: "CRITICAL",
        occurredAt: new Date(),
      }),
    );

    const result = await useCase.execute({ organizationId: "org-1", tenderId: "tender-1", actorRole: "READ_ONLY", actorId: "actor-1" });

    expect(result.status).toBe("NOT_READY");
  });

  it("throws TenderNotFoundError for a tender in another organization", async () => {
    await expect(
      useCase.execute({ organizationId: "org-2", tenderId: "tender-1", actorRole: "READ_ONLY", actorId: "actor-1" }),
    ).rejects.toThrow(TenderNotFoundError);
  });
});
