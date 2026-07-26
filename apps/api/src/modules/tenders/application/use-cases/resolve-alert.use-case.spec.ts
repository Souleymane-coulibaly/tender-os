import { beforeEach, describe, expect, it } from "vitest";
import { Alert } from "../../domain/alert.entity";
import { AlertNotFoundError, TenderPermissionMissingError } from "../../domain/errors";
import { FixedClock, InMemoryAlertRepository, InMemoryAuditLogWriter } from "../../test-support/fakes";
import { ResolveAlertUseCase } from "./resolve-alert.use-case";

describe("ResolveAlertUseCase", () => {
  let alertRepository: InMemoryAlertRepository;
  let auditLogWriter: InMemoryAuditLogWriter;
  let useCase: ResolveAlertUseCase;

  beforeEach(async () => {
    alertRepository = new InMemoryAlertRepository();
    auditLogWriter = new InMemoryAuditLogWriter();
    useCase = new ResolveAlertUseCase(alertRepository, auditLogWriter, new FixedClock());

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

  it("throws AlertNotFoundError for an alert belonging to another tenant", async () => {
    await expect(
      useCase.execute({
        organizationId: "org-2",
        tenderId: "tender-1",
        alertId: "alert-1",
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
});
