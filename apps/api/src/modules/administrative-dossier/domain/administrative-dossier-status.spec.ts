import { describe, expect, it } from "vitest";
import { AdministrativeChecklistLineState } from "./administrative-checklist";
import { AdministrativeDossierStatus, deriveAdministrativeDossierStatus } from "./administrative-dossier-status";

describe("deriveAdministrativeDossierStatus — mission §6/§9", () => {
  it("returns INCOMPLETE when there are no mandatory lines, or none has progressed", () => {
    expect(deriveAdministrativeDossierStatus({ mandatoryLineStates: [] })).toBe(AdministrativeDossierStatus.Incomplete);
    expect(deriveAdministrativeDossierStatus({ mandatoryLineStates: [AdministrativeChecklistLineState.Manquant] })).toBe(AdministrativeDossierStatus.Incomplete);
  });

  it("returns TO_COMPLETE once at least one line has progressed but not all", () => {
    expect(
      deriveAdministrativeDossierStatus({ mandatoryLineStates: [AdministrativeChecklistLineState.ACompleter, AdministrativeChecklistLineState.Manquant] }),
    ).toBe(AdministrativeDossierStatus.ToComplete);
  });

  it("returns IN_VERIFICATION when a mandatory line is being reviewed or validated", () => {
    expect(deriveAdministrativeDossierStatus({ mandatoryLineStates: [AdministrativeChecklistLineState.AVerifier] })).toBe(AdministrativeDossierStatus.InVerification);
    expect(deriveAdministrativeDossierStatus({ mandatoryLineStates: [AdministrativeChecklistLineState.EnValidation] })).toBe(AdministrativeDossierStatus.InVerification);
  });

  it("returns READY only when every mandatory line is VALIDE/PRET/NON_APPLICABLE", () => {
    expect(
      deriveAdministrativeDossierStatus({ mandatoryLineStates: [AdministrativeChecklistLineState.Valide, AdministrativeChecklistLineState.NonApplicable] }),
    ).toBe(AdministrativeDossierStatus.Ready);
  });

  it("returns BLOCKED as soon as any mandatory line is EXPIRE — wins over everything else", () => {
    expect(
      deriveAdministrativeDossierStatus({ mandatoryLineStates: [AdministrativeChecklistLineState.Valide, AdministrativeChecklistLineState.Expire] }),
    ).toBe(AdministrativeDossierStatus.Blocked);
  });
});
