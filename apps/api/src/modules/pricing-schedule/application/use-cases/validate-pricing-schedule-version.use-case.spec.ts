import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EntitlementService } from "../../../billing";
import { FinancialDocumentType, PricingScheduleLineKind, PricingScheduleStatus, PricingScheduleVersionStatus } from "../../domain/enums";
import { PricingScheduleValidationBlockedError, PricingScheduleVersionValidatedError } from "../../domain/errors";
import { PricingScheduleLine } from "../../domain/pricing-schedule-line.entity";
import { PricingScheduleVersion } from "../../domain/pricing-schedule-version.entity";
import { PricingSchedule } from "../../domain/pricing-schedule.aggregate";
import {
  FakeAtomicTransactionRunner,
  FixedClock,
  InMemoryAuditLogWriter,
  InMemoryPricingScheduleLineRepository,
  InMemoryPricingScheduleVersionRepository,
  InMemoryPricingScheduleRepository,
} from "../../test-support/fakes";
import type { PricingScheduleAccessService } from "../services/pricing-schedule-access.service";
import { ValidatePricingScheduleVersionUseCase } from "./validate-pricing-schedule-version.use-case";

const OCCURRED_AT = new Date("2026-01-01T00:00:00.000Z");

describe("ValidatePricingScheduleVersionUseCase", () => {
  let scheduleRepository: InMemoryPricingScheduleRepository;
  let versionRepository: InMemoryPricingScheduleVersionRepository;
  let lineRepository: InMemoryPricingScheduleLineRepository;
  let auditLogWriter: InMemoryAuditLogWriter;
  let accessService: { loadSchedule: ReturnType<typeof vi.fn> };
  let clock: FixedClock;

  const schedule = PricingSchedule.rehydrate({
    id: "schedule-1",
    organizationId: "org-1",
    tenderId: "tender-1",
    clientAccountId: "client-1",
    financialDocumentType: FinancialDocumentType.Bpu,
    sourceDocumentId: "doc-1",
    sourceDocumentVersionId: "doc-version-1",
    status: PricingScheduleStatus.Ready,
    currentVersionId: "version-1",
    currentVersionNumber: 1,
    createdBy: "user-1",
    createdAt: OCCURRED_AT,
    updatedAt: OCCURRED_AT,
  });

  function fakeEntitlementService(): EntitlementService {
    return {
      canOperateOnTender: vi.fn(async () => true),
      runTenderOperationEntitled: vi.fn(async (_input: unknown, operation: () => Promise<unknown>) => operation()),
    } as unknown as EntitlementService;
  }

  function buildUseCase(): ValidatePricingScheduleVersionUseCase {
    return new ValidatePricingScheduleVersionUseCase(
      scheduleRepository,
      versionRepository,
      lineRepository,
      auditLogWriter,
      new FakeAtomicTransactionRunner(),
      clock,
      accessService as unknown as PricingScheduleAccessService,
      fakeEntitlementService(),
    );
  }

  function createVersion(): PricingScheduleVersion {
    return PricingScheduleVersion.create({
      id: "version-1",
      organizationId: "org-1",
      pricingScheduleId: "schedule-1",
      versionNumber: 1,
      sourceDocumentVersionId: "doc-version-1",
      createdBy: "user-1",
      occurredAt: OCCURRED_AT,
    });
  }

  beforeEach(() => {
    clock = new FixedClock();
    scheduleRepository = new InMemoryPricingScheduleRepository();
    versionRepository = new InMemoryPricingScheduleVersionRepository();
    lineRepository = new InMemoryPricingScheduleLineRepository();
    auditLogWriter = new InMemoryAuditLogWriter();
    accessService = { loadSchedule: vi.fn(async () => schedule) };
    scheduleRepository.schedules.push(schedule);
    versionRepository.versions.push(createVersion());
  });

  it("BLOQUANT — refuses to validate when blocking (ERROR) controls remain and no justification is supplied", async () => {
    lineRepository.lines.push(
      PricingScheduleLine.create({ id: "line-1", organizationId: "org-1", pricingScheduleVersionId: "version-1", sheetName: "Lot1", rowNumber: 3, kind: PricingScheduleLineKind.PriceItem, designation: "Poste A", occurredAt: OCCURRED_AT }),
    );
    const useCase = buildUseCase();

    await expect(useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "BID_MANAGER", pricingScheduleId: "schedule-1", pricingScheduleVersionId: "version-1" })).rejects.toThrow(
      PricingScheduleValidationBlockedError,
    );
    expect(versionRepository.versions[0]!.status).toBe(PricingScheduleVersionStatus.Draft);
  });

  it("BLOQUANT — an explicit justification allows overriding ERROR controls AND records a dedicated audit entry", async () => {
    lineRepository.lines.push(
      PricingScheduleLine.create({ id: "line-1", organizationId: "org-1", pricingScheduleVersionId: "version-1", sheetName: "Lot1", rowNumber: 3, kind: PricingScheduleLineKind.PriceItem, designation: "Poste A", occurredAt: OCCURRED_AT }),
    );
    const useCase = buildUseCase();

    const version = await useCase.execute({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: "BID_MANAGER",
      pricingScheduleId: "schedule-1",
      pricingScheduleVersionId: "version-1",
      overrideJustification: "Prix volontairement à zéro pour ce lot, confirmé avec le client.",
    });

    expect(version.status).toBe(PricingScheduleVersionStatus.Validated);
    expect(auditLogWriter.entries.map((e) => e.action)).toEqual(expect.arrayContaining(["pricing_schedule.validated", "pricing_schedule.validation_overridden"]));
  });

  it("validates cleanly (no override needed) when every PRICE_ITEM line is fully priced and coherent", async () => {
    const line = PricingScheduleLine.create({
      id: "line-1",
      organizationId: "org-1",
      pricingScheduleVersionId: "version-1",
      sheetName: "Lot1",
      rowNumber: 3,
      kind: PricingScheduleLineKind.PriceItem,
      designation: "Poste A",
      quantity: "10",
      unit: "u",
      matchingKey: "poste a",
      occurredAt: OCCURRED_AT,
    });
    line.setUnitPrice({ unitPrice: "5", occurredAt: OCCURRED_AT });
    lineRepository.lines.push(line);
    const useCase = buildUseCase();

    const version = await useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "BID_MANAGER", pricingScheduleId: "schedule-1", pricingScheduleVersionId: "version-1" });
    expect(version.status).toBe(PricingScheduleVersionStatus.Validated);
    expect(scheduleRepository.schedules[0]!.status).toBe(PricingScheduleStatus.Validated);
    expect(auditLogWriter.entries.map((e) => e.action)).toEqual(["pricing_schedule.validated"]);
  });

  it("BLOQUANT — an already-VALIDATED version refuses a second validation, even with a justification", async () => {
    const line = PricingScheduleLine.create({ id: "line-1", organizationId: "org-1", pricingScheduleVersionId: "version-1", sheetName: "Lot1", rowNumber: 3, kind: PricingScheduleLineKind.PriceItem, designation: "Poste A", occurredAt: OCCURRED_AT });
    line.setUnitPrice({ unitPrice: "5", occurredAt: OCCURRED_AT });
    lineRepository.lines.push(line);
    versionRepository.versions[0]!.validate({ validatedBy: "user-1", occurredAt: OCCURRED_AT });

    const useCase = buildUseCase();
    await expect(
      useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "BID_MANAGER", pricingScheduleId: "schedule-1", pricingScheduleVersionId: "version-1", overrideJustification: "x" }),
    ).rejects.toThrow(PricingScheduleVersionValidatedError);
  });
});
