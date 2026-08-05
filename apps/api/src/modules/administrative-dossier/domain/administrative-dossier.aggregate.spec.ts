import { describe, expect, it } from "vitest";
import { AdministrativeDossier } from "./administrative-dossier.aggregate";
import { AdministrativeDossierStatus, AdministrativeDossierValidationStatus } from "./administrative-dossier-status";

const NOW = new Date("2026-09-10T10:00:00.000Z");

function create() {
  return AdministrativeDossier.create({ id: "dossier-1", organizationId: "org-1", clientAccountId: "client-1", tenderId: "tender-1", occurredAt: NOW });
}

describe("AdministrativeDossier — mission §6", () => {
  it("starts INCOMPLETE, 0%, NOT_VALIDATED", () => {
    const dossier = create();
    expect(dossier.status).toBe(AdministrativeDossierStatus.Incomplete);
    expect(dossier.completionPercentage).toBe(0);
    expect(dossier.validationStatus).toBe(AdministrativeDossierValidationStatus.NotValidated);
  });

  it("applyComputedStatus updates status/completion and increments version", () => {
    const dossier = create();
    dossier.applyComputedStatus({ status: AdministrativeDossierStatus.ToComplete, completionPercentage: 40, occurredAt: NOW });
    expect(dossier.status).toBe(AdministrativeDossierStatus.ToComplete);
    expect(dossier.completionPercentage).toBe(40);
    expect(dossier.version).toBe(1);
  });

  it("recordHumanValidation sets VALIDATED with validator/date", () => {
    const dossier = create();
    dossier.applyComputedStatus({ status: AdministrativeDossierStatus.Ready, completionPercentage: 100, occurredAt: NOW });
    dossier.recordHumanValidation({ validatedBy: "user-1", occurredAt: NOW });
    expect(dossier.validationStatus).toBe(AdministrativeDossierValidationStatus.Validated);
    expect(dossier.lastValidatedBy).toBe("user-1");
  });

  it("a recompute that falls below READY after a human validation flips VALIDATED to OUTDATED — never left silently VALIDATED", () => {
    const dossier = create();
    dossier.applyComputedStatus({ status: AdministrativeDossierStatus.Ready, completionPercentage: 100, occurredAt: NOW });
    dossier.recordHumanValidation({ validatedBy: "user-1", occurredAt: NOW });
    dossier.applyComputedStatus({ status: AdministrativeDossierStatus.ToComplete, completionPercentage: 80, occurredAt: NOW });
    expect(dossier.validationStatus).toBe(AdministrativeDossierValidationStatus.Outdated);
  });
});
