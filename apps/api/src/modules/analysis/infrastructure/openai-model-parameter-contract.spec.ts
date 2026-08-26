import { describe, expect, it } from "vitest";
import { AI_ROUTING_MODEL_CATALOG } from "../../ai-routing/domain/ai-routing-model";
import { ALLOWED_MODEL_CATALOG } from "../../ai-benchmark/domain/allowed-model-catalog";
import { buildMaxOutputTokensBody, maxOutputTokensParameterFor } from "./openai-model-parameter-contract";

/**
 * Checkpoint TENDEROS-2.1-POST-DECOM-TNR-FIX-2 — F-03.
 *
 * Défaut d'origine : l'adaptateur envoyait TOUJOURS `max_tokens`, que les modèles du catalogue de
 * routage live (`gpt-5.4-*`) refusent avec un HTTP 400. La mémoire technique et le Chat — seuls
 * appelants à exprimer `maxOutputTokens` — étaient donc entièrement inopérants, tandis que l'Analyse
 * fonctionnait par accident (elle ne borne pas sa sortie).
 *
 * Ces tests portent sur le CONTRAT, jamais sur une liste recopiée : les deux catalogues réels sont
 * importés et parcourus, si bien qu'un modèle ajouté demain sans contrat déclaré fait échouer ici.
 */
describe("Contrat de borne de sortie OpenAI (F-03)", () => {
  it("BLOQUANT — gpt-5.4-mini reçoit max_completion_tokens et JAMAIS max_tokens", () => {
    const body = buildMaxOutputTokensBody("gpt-5.4-mini", 1200);

    expect(body).toEqual({ max_completion_tokens: 1200 });
    expect(body).not.toHaveProperty("max_tokens");
  });

  it("BLOQUANT — la famille gpt-4 conserve max_tokens : corriger gpt-5.4 ne la casse pas", () => {
    for (const modelKey of ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini"]) {
      const body = buildMaxOutputTokensBody(modelKey, 800);
      expect(body, modelKey).toEqual({ max_tokens: 800 });
    }
  });

  it("BLOQUANT — o3-mini (raisonnement) attend lui aussi max_completion_tokens", () => {
    expect(maxOutputTokensParameterFor("o3-mini")).toBe("max_completion_tokens");
  });

  it("BLOQUANT — tout modèle du catalogue de ROUTAGE LIVE a un contrat explicitement déclaré", () => {
    for (const entry of Object.values(AI_ROUTING_MODEL_CATALOG)) {
      expect(maxOutputTokensParameterFor(entry.modelKey), entry.modelKey).toBe("max_completion_tokens");
    }
  });

  it("BLOQUANT — tout modèle OpenAI du registre benchmark résout un contrat connu", () => {
    for (const modelKey of ALLOWED_MODEL_CATALOG.OPENAI ?? []) {
      expect(["max_tokens", "max_completion_tokens"], modelKey).toContain(maxOutputTokensParameterFor(modelKey));
    }
  });

  it("aucune borne exprimée = aucun champ envoyé — jamais un paramètre que l'appelant n'a pas demandé", () => {
    expect(buildMaxOutputTokensBody("gpt-5.4-mini", undefined)).toEqual({});
    expect(buildMaxOutputTokensBody("gpt-4o", 0)).toEqual({});
  });

  it("un modèle inconnu hérite du contrat MODERNE, jamais du contrat en retrait", () => {
    expect(maxOutputTokensParameterFor("modele-futur-inconnu")).toBe("max_completion_tokens");
  });
});
