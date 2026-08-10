import { describe, expect, it } from "vitest";
import { matchBpuDqeCoherence } from "./match-bpu-dqe-coherence";
import { PricingScheduleLine } from "../pricing-schedule-line.entity";
import { PricingScheduleLineKind } from "../enums";

let counter = 0;
function nextId(): string {
  counter += 1;
  return `line-${counter}`;
}

function createPricedLine(designation: string, unitPrice: string, overrides?: Partial<Parameters<typeof PricingScheduleLine.create>[0]>) {
  const line = PricingScheduleLine.create({
    id: nextId(),
    organizationId: "org-1",
    pricingScheduleVersionId: "version-1",
    sheetName: "Lot1",
    rowNumber: 3,
    kind: PricingScheduleLineKind.PriceItem,
    designation,
    quantity: "10",
    matchingKey: designation.toLowerCase(),
    occurredAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  });
  line.setUnitPrice({ unitPrice, occurredAt: new Date() });
  return line;
}

describe("matchBpuDqeCoherence", () => {
  it("BLOQUANT — flags a divergent unit price between BPU and DQE for the same matched item, never silently reconciled", () => {
    const bpuLine = createPricedLine("Nettoyage des bureaux", "10");
    const dqeLine = createPricedLine("Nettoyage des bureaux", "12", { rowNumber: 5 });

    const findings = matchBpuDqeCoherence({ primaryLines: [bpuLine], comparedScheduleId: "dqe-schedule", comparedLines: [dqeLine] });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ primaryLineId: bpuLine.id, comparedLineId: dqeLine.id, primaryUnitPrice: "10.000000", comparedUnitPrice: "12.000000" });
  });

  it("no finding when unit prices match exactly", () => {
    const bpuLine = createPricedLine("Nettoyage des bureaux", "10");
    const dqeLine = createPricedLine("Nettoyage des bureaux", "10", { rowNumber: 5 });
    expect(matchBpuDqeCoherence({ primaryLines: [bpuLine], comparedScheduleId: "dqe-schedule", comparedLines: [dqeLine] })).toEqual([]);
  });

  it("BLOQUANT — never guesses a match when the matchingKey is ambiguous (multiple candidates on the compared side)", () => {
    const bpuLine = createPricedLine("Prestation A", "10");
    const dqeLine1 = createPricedLine("Prestation A", "12", { rowNumber: 5 });
    const dqeLine2 = createPricedLine("Prestation A", "15", { rowNumber: 6 });
    expect(matchBpuDqeCoherence({ primaryLines: [bpuLine], comparedScheduleId: "dqe-schedule", comparedLines: [dqeLine1, dqeLine2] })).toEqual([]);
  });

  it("never matches lines from different sheets even with the same matchingKey", () => {
    const bpuLine = createPricedLine("Prestation A", "10", { sheetName: "Lot1" });
    const dqeLine = createPricedLine("Prestation A", "20", { sheetName: "Lot2", rowNumber: 5 });
    expect(matchBpuDqeCoherence({ primaryLines: [bpuLine], comparedScheduleId: "dqe-schedule", comparedLines: [dqeLine] })).toEqual([]);
  });

  it("ignores unpriced lines on either side", () => {
    const bpuLine = PricingScheduleLine.create({
      id: nextId(),
      organizationId: "org-1",
      pricingScheduleVersionId: "version-1",
      sheetName: "Lot1",
      rowNumber: 3,
      kind: PricingScheduleLineKind.PriceItem,
      designation: "Prestation A",
      matchingKey: "prestation a",
      occurredAt: new Date(),
    });
    const dqeLine = createPricedLine("Prestation A", "20", { rowNumber: 5 });
    expect(matchBpuDqeCoherence({ primaryLines: [bpuLine], comparedScheduleId: "dqe-schedule", comparedLines: [dqeLine] })).toEqual([]);
  });
});
