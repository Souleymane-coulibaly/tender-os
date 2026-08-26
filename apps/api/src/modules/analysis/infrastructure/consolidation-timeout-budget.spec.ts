import { describe, expect, it } from "vitest";
import { loadAnalysisConfig } from "./analysis-config";

/**
 * Checkpoint TENDEROS-2.1-POST-DECOM-TNR-FIX-1 — F-01 (axe A) : le budget de temps appartient au
 * TRAVAIL, jamais à un réglage global.
 *
 * Contrat testé, jamais les constantes : la consolidation doit disposer d'un budget strictement
 * supérieur à celui de l'analyse d'un document, les deux doivent rester réglables séparément, et
 * une valeur invalide doit continuer d'échouer explicitement plutôt que d'être ignorée.
 */
describe("Budget de temps de la consolidation (F-01 axe A)", () => {
  it("BLOQUANT — la consolidation dispose d'un budget PROPRE, strictement plus large que le document", () => {
    const config = loadAnalysisConfig({});

    expect(config.aiTimeoutMsForTenderConsolidation).toBeGreaterThan(config.aiTimeoutMs);
  });

  it("BLOQUANT — augmenter le budget de la consolidation ne touche PAS celui du document", () => {
    const config = loadAnalysisConfig({ AI_TIMEOUT_MS_TENDER_CONSOLIDATION: "240000" });

    expect(config.aiTimeoutMsForTenderConsolidation).toBe(240_000);
    expect(config.aiTimeoutMs).toBe(loadAnalysisConfig({}).aiTimeoutMs);
  });

  it("BLOQUANT — le budget du document reste réglable indépendamment", () => {
    const config = loadAnalysisConfig({ AI_TIMEOUT_MS: "15000" });

    expect(config.aiTimeoutMs).toBe(15_000);
    expect(config.aiTimeoutMsForTenderConsolidation).toBe(loadAnalysisConfig({}).aiTimeoutMsForTenderConsolidation);
  });

  it("une valeur invalide échoue explicitement — jamais un repli silencieux sur le défaut", () => {
    expect(() => loadAnalysisConfig({ AI_TIMEOUT_MS_TENDER_CONSOLIDATION: "0" })).toThrow(
      /AI_TIMEOUT_MS_TENDER_CONSOLIDATION/,
    );
    expect(() => loadAnalysisConfig({ AI_TIMEOUT_MS_TENDER_CONSOLIDATION: "abc" })).toThrow();
  });
});
