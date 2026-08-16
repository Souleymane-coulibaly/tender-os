import { describe, expect, it } from "vitest";
import { z } from "zod";
import { TENDEROS_SYSTEM_PROMPT } from "../../../shared-kernel/tenderos-system-prompt";
import { StaticPromptTemplateProvider } from "./static-prompt-template.provider";
import { PromptKey } from "../application/ports/prompt-template.port";
import { DocumentAnalysisOutputSchema } from "../application/schemas/business/document-analysis-output.schema";
import { TenderConsolidationOutputSchema } from "../application/schemas/business/tender-consolidation-output.schema";

/**
 * Régression (mission Sprint 8A.2, correction du crash `AI_SCHEMA_VALIDATION_FAILED` reproduit en
 * production — `deadlines[].label` exigé par le schéma mais jamais demandé au modèle) — introspecte
 * les schémas Zod EUX-MÊMES plutôt qu'une liste de champs recopiée à la main : si un futur champ
 * requis est ajouté à un schéma sans que le prompt correspondant soit mis à jour, ce test échoue,
 * jamais une découverte en production comme cette fois-ci.
 */

function unwrap(schema: z.ZodTypeAny): z.ZodTypeAny {
  return schema instanceof z.ZodEffects ? unwrap(schema.innerType()) : schema;
}

function requiredFieldNames(schema: z.ZodTypeAny): string[] {
  const objectSchema = unwrap(schema) as z.ZodObject<z.ZodRawShape>;
  return Object.entries(objectSchema.shape)
    .filter(([, fieldSchema]) => !(fieldSchema as z.ZodTypeAny).isOptional())
    .map(([key]) => key);
}

function requiredItemFieldNames(arraySchema: z.ZodTypeAny): string[] {
  const array = unwrap(arraySchema) as z.ZodArray<z.ZodTypeAny>;
  return requiredFieldNames(array.element);
}

function assertPromptMentionsEveryField(promptText: string, fields: readonly string[]): void {
  for (const field of fields) {
    // Le prompt cite la plupart des champs entre quotes ('label') mais énumère les champs de
    // premier niveau en liste nue ("metadata (object), deadlines (array)...") — un mot entier
    // (bornes \b) suffit à prouver que le modèle en a été informé, peu importe la ponctuation.
    expect(promptText, `le prompt doit mentionner le champ requis '${field}'`).toMatch(new RegExp(`\\b${field}\\b`));
  }
}

describe("StaticPromptTemplateProvider — couverture prompt/schéma", () => {
  const provider = new StaticPromptTemplateProvider();

  it("ANALYZE_DOCUMENT mentionne chaque champ requis de DocumentAnalysisOutputSchema et de ses items", () => {
    const rendered = provider.render(PromptKey.AnalyzeDocument, { chunksText: "[0] exemple" });
    const fullText = `${rendered.systemPrompt}\n${rendered.userPrompt}`;

    assertPromptMentionsEveryField(fullText, requiredFieldNames(DocumentAnalysisOutputSchema));
    assertPromptMentionsEveryField(fullText, requiredItemFieldNames(DocumentAnalysisOutputSchema.shape.deadlines));
    assertPromptMentionsEveryField(fullText, requiredItemFieldNames(DocumentAnalysisOutputSchema.shape.criteria));
    assertPromptMentionsEveryField(fullText, requiredItemFieldNames(DocumentAnalysisOutputSchema.shape.requirements));
    assertPromptMentionsEveryField(fullText, requiredItemFieldNames(DocumentAnalysisOutputSchema.shape.clauses));
  });

  it("CONSOLIDATE_TENDER_ANALYSIS mentionne chaque champ requis de TenderConsolidationOutputSchema et de ses items", () => {
    const rendered = provider.render(PromptKey.ConsolidateTenderAnalysis, { documentAnalysesJson: "[]" });
    const fullText = `${rendered.systemPrompt}\n${rendered.userPrompt}`;

    assertPromptMentionsEveryField(fullText, requiredFieldNames(TenderConsolidationOutputSchema));
    assertPromptMentionsEveryField(fullText, requiredItemFieldNames(TenderConsolidationOutputSchema.shape.risks));
    assertPromptMentionsEveryField(fullText, requiredItemFieldNames(TenderConsolidationOutputSchema.shape.questions));
    assertPromptMentionsEveryField(fullText, requiredFieldNames(TenderConsolidationOutputSchema.shape.summary));
  });

  describe("Consolidation IA — Checkpoint B §2, correctif audit P2 (séparation structurelle)", () => {
    // Le System Prompt plateforme n'est plus concaténé ici — il est injecté comme son propre
    // message `{role: "system"}` par `OpenAiProvider.complete()` (voir openai.ai-provider.spec.ts).
    // Ces `systemPrompt` de rendu restent donc PUREMENT le texte de tâche Analyse.
    it("ANALYZE_DOCUMENT's systemPrompt never embeds the platform System Prompt text", () => {
      const rendered = provider.render(PromptKey.AnalyzeDocument, { chunksText: "[0] exemple" });
      expect(rendered.systemPrompt).not.toContain(TENDEROS_SYSTEM_PROMPT);
    });

    it("CONSOLIDATE_TENDER_ANALYSIS's systemPrompt never embeds the platform System Prompt text", () => {
      const rendered = provider.render(PromptKey.ConsolidateTenderAnalysis, { documentAnalysesJson: "[]" });
      expect(rendered.systemPrompt).not.toContain(TENDEROS_SYSTEM_PROMPT);
    });
  });
});
