import { beforeEach, describe, expect, it } from "vitest";
import { ClientAccountNotFoundError } from "../../../client-portfolio";
import { Alert } from "../../domain/alert.entity";
import { AlertNotFoundError, TenderNotFoundError, TenderPermissionMissingError } from "../../domain/errors";
import { TenderId } from "../../domain/tender-id.value-object";
import { Tender } from "../../domain/tender.aggregate";
import {
  createClientPortfolioTestFixture,
  DEFAULT_TEST_CLIENT_ACCOUNT_ID,
  FixedClock,
  InMemoryAlertRepository,
  InMemoryAuditLogWriter,
  InMemoryTenderRepository,
} from "../../test-support/fakes";
import { ResolveAlertUseCase } from "./resolve-alert.use-case";

describe("ResolveAlertUseCase", () => {
  let alertRepository: InMemoryAlertRepository;
  let auditLogWriter: InMemoryAuditLogWriter;
  let tenderRepository: InMemoryTenderRepository;
  let clientPortfolio: Awaited<ReturnType<typeof createClientPortfolioTestFixture>>;
  let useCase: ResolveAlertUseCase;

  beforeEach(async () => {
    alertRepository = new InMemoryAlertRepository();
    auditLogWriter = new InMemoryAuditLogWriter();
    tenderRepository = new InMemoryTenderRepository();
    clientPortfolio = await createClientPortfolioTestFixture("org-1");
    useCase = new ResolveAlertUseCase(
      alertRepository,
      auditLogWriter,
      new FixedClock(),
      tenderRepository,
      clientPortfolio.assertClientAccessUseCase,
    );

    await tenderRepository.seed(
      Tender.create({
        id: TenderId.from("tender-1"),
        organizationId: "org-1",
        clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID,
        title: "Marche de travaux",
        createdBy: "user-1",
        occurredAt: new Date(),
      }),
    );
    await alertRepository.seed(
      Alert.create({
        id: "alert-1",
        organizationId: "org-1",
        tenderId: "tender-1",
        type: "DEADLINE",
        severity: "CRITICAL",
        message: "Echeance proche sans document valide",
        occurredAt: new Date("2026-01-01T00:00:00Z"),
      }),
    );
  });

  it("marks the alert resolved and records an audit entry", async () => {
    const result = await useCase.execute({
      organizationId: "org-1",
      tenderId: "tender-1",
      alertId: "alert-1",
      actorId: "user-1",
      actorRole: "BID_MANAGER",
    });

    expect(result.resolved).toBe(true);
    expect(result.resolvedBy).toBe("user-1");
    expect(auditLogWriter.entries[0]?.action).toBe("tender.alert_resolved");
  });

  it("throws TenderNotFoundError when the tender does not belong to the caller's organization", async () => {
    await expect(
      useCase.execute({
        organizationId: "org-2",
        tenderId: "tender-1",
        alertId: "alert-1",
        actorId: "user-1",
        actorRole: "BID_MANAGER",
      }),
    ).rejects.toThrow(TenderNotFoundError);
  });

  it("throws AlertNotFoundError for an unknown alert id on an accessible tender", async () => {
    await expect(
      useCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        alertId: "unknown-alert",
        actorId: "user-1",
        actorRole: "BID_MANAGER",
      }),
    ).rejects.toThrow(AlertNotFoundError);
  });

  it("refuses when the actor lacks tender:manage_alerts", async () => {
    await expect(
      useCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        alertId: "alert-1",
        actorId: "user-1",
        actorRole: "READ_ONLY",
      }),
    ).rejects.toThrow(TenderPermissionMissingError);
  });

  it("correction P0 — refuses a MEMBER-tier actor with no assignment on the tender's client, even with tender:manage_alerts", async () => {
    await expect(
      useCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        alertId: "alert-1",
        actorId: "user-unaffiliated",
        actorRole: "BID_MANAGER",
      }),
    ).rejects.toBeInstanceOf(ClientAccountNotFoundError);
  });
});
