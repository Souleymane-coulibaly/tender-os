import { afterEach, describe, expect, it } from "vitest";
import { filterPresentSteps, findGuideTarget, guideTargetSelector, hasPresentStep, isPageGuideAction, isPageGuideKey, seenGuideKeysFromItems } from "./page-guide-runtime";

const STEPS = [
  { target: "guide-x-a", title: "A", body: "A" },
  { target: "guide-x-b", title: "B", body: "B" },
  { target: "guide-x-c", title: "C", body: "C" },
];

afterEach(() => {
  document.body.innerHTML = "";
});

describe("page-guide-runtime", () => {
  it("échappe la valeur ciblée (jamais un sélecteur invalide)", () => {
    expect(guideTargetSelector('a"b')).toBe('[data-tour="a\\"b"]');
    expect(() => findGuideTarget('a"b')).not.toThrow();
  });

  it("ne garde que les étapes dont la cible est présente, dans l'ordre", () => {
    document.body.innerHTML = '<div data-tour="guide-x-c"></div><div data-tour="guide-x-a"></div>';
    expect(filterPresentSteps(STEPS).map((step) => step.target)).toEqual(["guide-x-a", "guide-x-c"]);
    expect(hasPresentStep(STEPS)).toBe(true);
  });

  it("aucune cible (ou aucune étape) → rien à montrer", () => {
    expect(filterPresentSteps(STEPS)).toEqual([]);
    expect(hasPresentStep(STEPS)).toBe(false);
    expect(hasPresentStep([])).toBe(false);
  });

  it("clés « vues » = terminées ou ignorées, clés inconnues écartées", () => {
    expect(
      seenGuideKeysFromItems([
        { guideKey: "tenders", completedAt: "2026-09-01T00:00:00.000Z" },
        { guideKey: "knowledge", dismissedAt: "2026-09-01T00:00:00.000Z", completedAt: null },
        { guideKey: "documents" },
        { guideKey: "inconnue", completedAt: "2026-09-01T00:00:00.000Z" },
      ]),
    ).toEqual(["tenders", "knowledge"]);
  });

  it("valide clés et actions", () => {
    expect(isPageGuideKey("tender-overview")).toBe(true);
    expect(isPageGuideKey("constructor")).toBe(false);
    expect(isPageGuideKey("../x")).toBe(false);
    expect(isPageGuideAction("COMPLETE")).toBe(true);
    expect(isPageGuideAction("START")).toBe(false);
  });
});
