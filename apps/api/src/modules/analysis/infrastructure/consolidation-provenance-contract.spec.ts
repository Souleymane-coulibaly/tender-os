import { describe, expect, it } from "vitest";
import { PromptKey } from "../application/ports/prompt-template.port";
import { StaticPromptTemplateProvider } from "./static-prompt-template.provider";

/**
 * Checkpoint TENDEROS-2.1-POST-DECOM-TNR-FIX-1 — F-01 (axe B) : le prompt et le validateur de
 * provenance doivent s'accorder sur CE QUE LE MODÈLE A LE DROIT DE VOIR.
 *
 * Racine du défaut : la consolidation reçoit les analyses documentaires (JSON), jamais le texte des
 * chunks — mais elle héritait des règles du scope DOCUMENT (« cite verbatim », « le marqueur [n] du
 * chunk où tu l'as trouvé »). Le modèle ne pouvait que fabriquer une citation, que
 * `validateTenderConsolidationProvenance` rejetait à juste titre.
 *
 * Ces tests verrouillent le CONTRAT, jamais la formulation exacte : ils vérifient que la
 * consolidation n'exige plus une citation rédigée par le modèle et qu'elle impose la recopie de la
 * provenance déjà validée au niveau document.
 */
describe("Contrat de provenance de la consolidation (F-01 axe B)", () => {
  const provider = new StaticPromptTemplateProvider();
  const consolidate = provider.render(PromptKey.ConsolidateTenderAnalysis, { documentAnalysesJson: "[]" });
  const analyzeDocument = provider.render(PromptKey.AnalyzeDocument, { chunksText: "[0] exemple" });
  const consolidateText = `${consolidate.systemPrompt}\n${consolidate.userPrompt}`;
  const documentText = `${analyzeDocument.systemPrompt}\n${analyzeDocument.userPrompt}`;

  it("BLOQUANT — la consolidation n'ordonne JAMAIS au modèle d'écrire une citation verbatim", () => {
    // C'était l'instruction impossible à satisfaire : elle appartient au scope DOCUMENT seul.
    expect(consolidateText).not.toContain("short verbatim excerpt");
  });

  it("BLOQUANT — la consolidation ne réclame plus le marqueur [n] d'un chunk qu'elle ne voit pas", () => {
    expect(consolidateText).not.toContain("the [n] marker of the chunk you found it in");
  });

  it("BLOQUANT — la consolidation impose la RECOPIE exacte de la provenance documentaire", () => {
    expect(consolidateText).toMatch(/COPY that finding's 'citation'/);
    expect(consolidateText).toContain("EXACTLY as they appear in the input");
    expect(consolidateText).toContain("MUST NOT write a citation of your own");
  });

  it("BLOQUANT — la consolidation interdit explicitement de fusionner deux citations", () => {
    // Une citation fusionnée ne correspond à aucun chunk réel : c'est exactement ce que le garde
    // rejetait. L'interdire dans le prompt supprime la cause, jamais le garde.
    expect(consolidateText).toContain("Never merge, shorten, translate, reformat or combine two citations");
  });

  it("BLOQUANT — un fait déduit doit être marqué isInferred plutôt que doté d'une citation inventée", () => {
    expect(consolidateText).toContain("'isInferred' to true");
    expect(consolidateText).toContain("A fabricated or reworded citation is worse than no citation at all");
  });

  it("le scope DOCUMENT conserve ses règles d'origine — il voit réellement le texte des chunks", () => {
    expect(documentText).toContain("short verbatim excerpt");
    expect(documentText).toContain("the [n] marker of the chunk you found it in");
    expect(documentText).toContain("[chunkSequence] marker");
  });

  it("la version du prompt de consolidation a été incrémentée, celle du document ne bouge pas", () => {
    expect(consolidate.version).toBeGreaterThan(analyzeDocument.version);
  });
});
