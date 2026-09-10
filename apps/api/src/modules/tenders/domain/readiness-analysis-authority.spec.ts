import { describe, expect, it } from "vitest";
import { calculateTenderReadiness, type TenderAnalysisReadinessState } from "./readiness-calculator";

/**
 * Checkpoint TENDEROS-2.1-POST-DECOM-TNR-FIX-1 — F-02 : le score de préparation ne doit JAMAIS
 * annoncer un dossier prêt tant que la consolidation du DCE n'est pas exploitable.
 *
 * Ces tests portent sur le CONTRAT métier, jamais sur les constantes de pondération : ils
 * n'affirment aucun score chiffré, seulement l'invariant « pas de consolidation courante ⇒ jamais
 * READY » et « un ensemble vide n'est satisfait que si une consolidation courante l'a établi ».
 */
const EMPTY = {
  checklistItems: [],
  criteria: [],
  milestones: [],
  risks: [],
  alerts: [],
  pendingMandatoryRequirements: 0,
  now: new Date("2026-06-01T00:00:00Z"),
};

const NOT_USABLE: TenderAnalysisReadinessState[] = ["MISSING", "PROCESSING", "FAILED", "STALE", "UNKNOWN"];

describe("Readiness — autorité de la consolidation (F-02)", () => {
  it("BLOQUANT — le dossier vide et SANS consolidation courante n'est jamais READY", () => {
    for (const analysis of NOT_USABLE) {
      const result = calculateTenderReadiness({ ...EMPTY, analysis });
      expect(result.status, `analysis=${analysis}`).not.toBe("READY");
      expect(result.status, `analysis=${analysis}`).not.toBe("READY_WITH_WARNINGS");
    }
  });

  it("BLOQUANT — c'était le défaut exact de la TNR : rien à faire + analyse en échec donnait READY", () => {
    // Reproduction du dossier observé en recette : checklist vide, aucune pièce requise, aucune
    // échéance, aucun risque — et une consolidation FAILED. L'ancien calcul attribuait le maximum
    // aux dimensions vides (ratio 1 sur ensemble vide) et concluait READY.
    const before = calculateTenderReadiness({ ...EMPTY, analysis: "FAILED" });

    expect(before.status).not.toBe("READY");
    const checklist = before.breakdown.find((entry) => entry.label === "Checklist obligatoire")!;
    expect(checklist.achievedRatio, "une checklist vide sans analyse n'est pas satisfaite").toBe(0);
    // Les pièces sont désormais des éléments de checklist : la règle « vide sans analyse = non
    // satisfait » ci-dessus les couvre, sans dimension distincte.
    expect(before.breakdown.some((entry) => entry.label === "Pièces obligatoires")).toBe(false);
  });

  it("un ensemble vide N'EST satisfait que si une consolidation COURANTE l'a établi", () => {
    const current = calculateTenderReadiness({ ...EMPTY, analysis: "CURRENT" });

    const checklist = current.breakdown.find((entry) => entry.label === "Checklist obligatoire")!;
    expect(checklist.achievedRatio, "l'analyse courante a établi qu'aucune exigence n'existe").toBe(1);
    expect(current.score).toBeGreaterThan(calculateTenderReadiness({ ...EMPTY, analysis: "FAILED" }).score);
  });

  it("une consolidation COURANTE laisse l'évaluation normale des autres préconditions se poursuivre", () => {
    const current = calculateTenderReadiness({ ...EMPTY, analysis: "CURRENT" });

    // Aucun critère d'attribution renseigné : le dossier n'atteint pas le maximum pour autant —
    // la consolidation courante débloque l'évaluation, elle ne la court-circuite pas.
    expect(current.score).toBeLessThan(100);
    expect(current.hasBlockingIssue).toBe(false);
  });

  it("STALE est traité aussi sévèrement que MISSING — une analyse périmée n'est jamais CURRENT", () => {
    const stale = calculateTenderReadiness({ ...EMPTY, analysis: "STALE" });
    const missing = calculateTenderReadiness({ ...EMPTY, analysis: "MISSING" });

    expect(stale.status).toBe(missing.status);
    expect(stale.score).toBe(missing.score);
  });
});
