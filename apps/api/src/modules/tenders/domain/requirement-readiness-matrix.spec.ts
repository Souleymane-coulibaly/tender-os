import { describe, expect, it } from "vitest";
import { calculateTenderReadiness } from "./readiness-calculator";

/**
 * Checkpoint TENDEROS-2.1-POST-DECOM-TNR-FIX-2 — F-06, matrice §18.
 *
 * Sémantique retenue, tirée du comportement produit et non devinée : la réconciliation de checklist
 * crée des SUGGESTIONS (`PENDING`), jamais des items — elles n'ont donc AUCUNE autorité métier tant
 * qu'un humain ne les a pas acceptées. Mais l'inverse est tout aussi vrai : leur existence prouve
 * que des exigences obligatoires ONT été détectées.
 *
 * Le système ne doit donc jamais conclure « aucune exigence obligatoire » sur la seule foi d'une
 * checklist vide alors que des exigences obligatoires attendent validation (§17). Une checklist vide
 * n'est créditée que lorsque l'incertitude est levée : analyse COURANTE **et** zéro suggestion
 * obligatoire en attente.
 */
const BASE = {
  checklistItems: [],
  criteria: [],
  milestones: [],
  risks: [],
  alerts: [],
  now: new Date("2026-06-01T00:00:00Z"),
};

const checklistRatio = (r: ReturnType<typeof calculateTenderReadiness>) =>
  r.breakdown.find((e) => e.label === "Checklist obligatoire")!.achievedRatio;

describe("REQUIREMENT_READINESS_MATRIX (F-06)", () => {
  it("BLOQUANT — analyse COURANTE + exigences obligatoires EN ATTENTE : la checklist vide n'est pas créditée", () => {
    const r = calculateTenderReadiness({ ...BASE, analysis: "CURRENT", pendingMandatoryRequirements: 5 });

    expect(checklistRatio(r)).toBe(0);
    expect(r.status).not.toBe("READY");
    expect(r.status).not.toBe("READY_WITH_WARNINGS");
  });

  it("BLOQUANT — c'était le défaut exact de la TNR-2 : 5 suggestions MANDATORY et pourtant 35/35", () => {
    const avant = calculateTenderReadiness({ ...BASE, analysis: "CURRENT", pendingMandatoryRequirements: 0 });
    const apres = calculateTenderReadiness({ ...BASE, analysis: "CURRENT", pendingMandatoryRequirements: 5 });

    // Sans incertitude, le crédit reste dû (l'analyse a établi qu'il n'y a rien) ...
    expect(checklistRatio(avant)).toBe(1);
    // ... avec incertitude, il ne l'est plus.
    expect(apres.score).toBeLessThan(avant.score);
  });

  it("analyse COURANTE + aucune exigence en attente : évaluation normale, READY atteignable", () => {
    const r = calculateTenderReadiness({ ...BASE, analysis: "CURRENT", pendingMandatoryRequirements: 0 });

    expect(checklistRatio(r)).toBe(1);
    expect(r.hasBlockingIssue).toBe(false);
  });

  it("BLOQUANT — analyse NON courante : le résultat est le même quel que soit le nombre en attente", () => {
    for (const analysis of ["MISSING", "FAILED", "STALE", "PROCESSING", "UNKNOWN"] as const) {
      for (const pending of [0, 5]) {
        const r = calculateTenderReadiness({ ...BASE, analysis, pendingMandatoryRequirements: pending });
        expect(r.status, `${analysis}/${pending}`).not.toBe("READY");
        expect(checklistRatio(r), `${analysis}/${pending}`).toBe(0);
      }
    }
  });

  it("une seule exigence obligatoire en attente suffit à retirer le crédit — pas de seuil de tolérance", () => {
    expect(checklistRatio(calculateTenderReadiness({ ...BASE, analysis: "CURRENT", pendingMandatoryRequirements: 1 }))).toBe(0);
  });
});
