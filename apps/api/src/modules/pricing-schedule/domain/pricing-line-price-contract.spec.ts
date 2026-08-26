import { describe, expect, it } from "vitest";
import { ControlCode } from "./enums";
import { PricingScheduleLine } from "./pricing-schedule-line.entity";
import { computePricingControls } from "./services/compute-pricing-controls";

/**
 * Checkpoint TENDEROS-2.1-POST-DECOM-TNR-FIX-2 — F-05, volet ZÉRO.
 *
 * La TNR-2 avait relevé que `0` et les valeurs négatives sont acceptés. L'audit du contrat montre
 * que ZÉRO est LÉGITIME : une ligne de BPU à 0 € (prestation incluse, offerte, ou déjà couverte par
 * une autre ligne) est une pratique réelle ; `MISSING_UNIT_PRICE` ne se déclenche que sur l'ABSENCE
 * de prix, jamais sur la valeur zéro, et le catalogue fermé des contrôles ne comporte aucun code de
 * refus fondé sur la valeur.
 *
 * Ce test existe pour qu'un futur correctif « prix > 0 » ne casse pas ce comportement par
 * inadvertance : un zéro chiffré doit rester un chiffrage VALIDE, distinct d'une ligne non chiffrée.
 */
function line(unitPrice: string | undefined) {
  const l = PricingScheduleLine.create({
    id: "11111111-1111-4111-8111-111111111111",
    organizationId: "22222222-2222-4222-8222-222222222222",
    pricingScheduleVersionId: "33333333-3333-4333-8333-333333333333",
    sheetName: "BPU",
    rowNumber: 2,
    kind: "PRICE_ITEM",
    hierarchyLevel: 0,
    designation: "Prestation incluse",
    unit: "ens",
    quantity: "1",
    occurredAt: new Date("2026-06-01T00:00:00Z"),
  });
  if (unitPrice !== undefined) l.setUnitPrice({ unitPrice, occurredAt: new Date("2026-06-01T00:00:00Z") });
  return l;
}

describe("Contrat de valeur d'un prix unitaire (F-05)", () => {
  it("BLOQUANT — un prix de 0 est un chiffrage VALIDE : aucun contrôle bloquant", () => {
    const { findings } = computePricingControls([line("0")]);

    expect(findings.filter((f) => f.code === ControlCode.MissingUnitPrice)).toEqual([]);
  });

  it("BLOQUANT — 0.00 se comporte exactement comme 0", () => {
    const { findings } = computePricingControls([line("0.00")]);

    expect(findings.filter((f) => f.code === ControlCode.MissingUnitPrice)).toEqual([]);
  });

  it("BLOQUANT — l'ABSENCE de prix reste distincte de zéro et reste bloquante", () => {
    const { findings } = computePricingControls([line(undefined)]);

    expect(findings.some((f) => f.code === ControlCode.MissingUnitPrice)).toBe(true);
  });

  it("un prix à zéro produit bien un total à zéro, jamais un total absent", () => {
    expect(Number(line("0").proposedTotal)).toBe(0);
  });
});
