import { describe, expect, it } from "vitest";
import { toChecklistDocumentSignals, type ChecklistDocumentInput } from "./checklist-document-signals";

/**
 * TENDEROS-2.1 — le GO/NO-GO lit les pièces dans la checklist depuis la fusion des « Pièces
 * demandées ». Ces tests figent la traduction : quels éléments sont des pièces, et ce que
 * « fournie » et « éliminatoire » veulent dire.
 */
function item(overrides: Partial<ChecklistDocumentInput> = {}): ChecklistDocumentInput {
  return { type: "ADMINISTRATIVE_DOCUMENT", required: true, criticality: "MEDIUM", complianceStatus: "TO_REVIEW", ...overrides };
}

describe("toChecklistDocumentSignals", () => {
  it("ne compte que les éléments qui désignent une PIÈCE à produire", () => {
    const signals = toChecklistDocumentSignals([
      item({ type: "ADMINISTRATIVE_DOCUMENT" }),
      item({ type: "CERTIFICATION" }),
      item({ type: "SIGNATURE" }),
      // Une visite, une échéance ou une exigence technique ne sont pas des pièces : les compter
      // fausserait la complétude documentaire.
      item({ type: "VISIT" }),
      item({ type: "DEADLINE" }),
      item({ type: "TECHNICAL_REQUIREMENT" }),
      item({ type: "OTHER" }),
    ]);

    expect(signals.total).toBe(3);
    expect(signals.required).toBe(3);
  });

  it("« fournie » = READY ou VALIDATED, soit exactement PROVIDED ou VALIDATED de l'ancienne pièce", () => {
    const signals = toChecklistDocumentSignals([
      item({ complianceStatus: "READY" }),
      item({ complianceStatus: "VALIDATED" }),
      item({ complianceStatus: "TO_REVIEW" }),
      item({ complianceStatus: "NON_COMPLIANT" }),
    ]);

    expect(signals.required).toBe(4);
    expect(signals.requiredUnprovided).toBe(2);
  });

  it("une pièce déclarée NOT_APPLICABLE n'est ni due ni manquante", () => {
    const signals = toChecklistDocumentSignals([item({ complianceStatus: "NOT_APPLICABLE", criticality: "BLOCKING" }), item()]);

    expect(signals.total).toBe(1);
    expect(signals.eliminatory).toBe(0);
  });

  it("« éliminatoire » = criticité BLOCKING, où la migration a reporté isEliminatory", () => {
    const signals = toChecklistDocumentSignals([
      item({ criticality: "BLOCKING", complianceStatus: "TO_REVIEW" }),
      item({ criticality: "BLOCKING", complianceStatus: "VALIDATED" }),
      item({ criticality: "HIGH", complianceStatus: "TO_REVIEW" }),
    ]);

    expect(signals.eliminatory).toBe(2);
    expect(signals.eliminatoryUnprovided).toBe(1);
  });

  it("une pièce non obligatoire compte dans la charge documentaire, pas dans les obligatoires manquantes", () => {
    const signals = toChecklistDocumentSignals([item({ required: false })]);

    expect(signals).toEqual({ total: 1, required: 0, eliminatory: 0, eliminatoryUnprovided: 0, requiredUnprovided: 0 });
  });

  it("une checklist vide donne des signaux nuls, que le score traite comme neutres", () => {
    expect(toChecklistDocumentSignals([])).toEqual({ total: 0, required: 0, eliminatory: 0, eliminatoryUnprovided: 0, requiredUnprovided: 0 });
  });
});
